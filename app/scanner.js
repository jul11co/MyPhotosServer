// app/scanner.js

var fs = require('fs');
var path = require('path');
var util = require('util');

var async = require('async');
var fse = require('fs-extra');

var EventEmitter = require('events').EventEmitter;

var DirtyStore = require('../lib/dirtystore');
var md5cache = require('../lib/md5cache');

var importer = require('./importer');
var utils = require('./utils');

var JobQueue = require('jul11co-jobqueue');

var Log = require('log');
var log = null;

var dispatchers = [];
fs.readdirSync(path.join(__dirname + '/dispatchers')).forEach(function(file) {
  if (file.indexOf('.js') > 0) {
    // console.log(file);
    var dispatcher = require("./dispatchers/" + file);
    dispatchers.push(new dispatcher());
  }
});

var scannerdb = null;

var Scanner = function(options) {
  options = options || {};
  EventEmitter.call(this);

  this._stopRequest = false;
  this._currentScanDir = '';
  this._threads = options.threads || 1;

  this._data_dir = options.data_dir || '.';

  this._import_queue = new JobQueue();

  var scanner_db_path = path.join(this._data_dir,'databases','scanner.db');
  if (!utils.fileExistsSync(scanner_db_path)
    && utils.fileExistsSync(path.join(this._data_dir,'scanner.db'))) {
    fse.move(path.join(this._data_dir,'scanner.db'), scanner_db_path, function(err) {
      scannerdb = new DirtyStore(scanner_db_path);
    });
  } else {
    scannerdb = new DirtyStore(scanner_db_path);
  }

  var md5cache_db_path = path.join(this._data_dir,'databases','md5cache.db');
  if (!utils.fileExistsSync(scanner_db_path)
    && utils.fileExistsSync(path.join(this._data_dir,'md5cache.db'))) {
    fse.move(path.join(this._data_dir,'md5cache.db'), md5cache_db_path, function(err) {
      md5cache.setDataStore(new DirtyStore(md5cache_db_path));
    });
  } else {
    md5cache.setDataStore(new DirtyStore(md5cache_db_path));
  }

  log = new Log('debug', fs.createWriteStream(path.join(this._data_dir,'scanner.log')));
  this.log = log;
}

util.inherits(Scanner, EventEmitter);

Scanner.prototype.getDataPath = function(datapath) {
  return path.join(this._data_dir, datapath);
}

Scanner.prototype.getThumbnailPath = function(thumb_file) {
  // var basename = path.basename(thumb_file, path.extname(thumb_file));
  var basename = path.basename(thumb_file);
  var thumbs_dir = path.join(this._data_dir, 'photo_thumbnails');
  if (basename.length >= 3) {
    return path.join(thumbs_dir, basename[0], basename[1], basename[2], thumb_file);
  }
  return path.join(thumbs_dir, thumb_file);
}

Scanner.prototype.getRelativeDataPath = function(datapath) {
  return path.relative(this._data_dir, datapath);
}

var importJob = function(args, done) {
  // var time_start = new Date();
  importer.importPhoto(args.data, args.options, function(err, result) {
    if (err) {
      // console.log(err);
      return done(err);
    }
    // console.log('TIME: importPhoto', new Date()-time_start);
    done(null, result);
  });
}

Scanner.prototype.importPhoto = function(data, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  if (options.verbose) console.log('importPhoto: ' + data.photo.name);
  log.info('importPhoto: ' + data.photo.path);

  // if (!data.photo.thumb_file) {
  //   log.error('Missing thumb file');
  //   return callback(new Error('Missing thumb file'));
  // }

  var self = this;

  if (data.photo.path && !data.photo.folder && self._currentScanDir != '') {
    // data.photo.folder = self._currentScanDir;
    data.photo.folder = path.resolve(path.dirname(data.photo.path));
    // data.photo.path = path.relative(data.photo.folder, data.photo.path);
  }

  if (options.force_update) data.force_update = true;

  var importPhotoFunc = function() {
    self._import_queue.pushJob({data: data, options: options}, importJob, function(err, result) {
      if (err) {
        // console.log(err);
        return callback(err);
      }
      if (result) {
        if (options.verbose) console.log(result);
        self.emit('imported', {
          type: 'photo',
          photo: result
        });
      } else {
        self.emit('imported', {
          type: 'photo',
          photo: data.photo
        });
      }
      self._currentStats.imported++;
      log.info('Photo imported:', data.photo.name);
      callback();
    });
  }

  if (data.photo.thumb_file) {
    var target_thumb_file = data.photo.md5;// + path.extname(data.photo.thumb_file);
    var target_thumb_path = self.getThumbnailPath(target_thumb_file);

    fse.copy(data.photo.thumb_file, target_thumb_path, function(err) {
      if (err) {
        if (err.code != 'EEXIST') console.log(err);
      }

      delete data.photo.thumb_file;
      // data.photo.thumb = '/' + self.getRelativeDataPath(target_thumb_path);
      data.photo.thumb = target_thumb_file;

      importPhotoFunc();
    });
  } else {
    importPhotoFunc();
  }
}

Scanner.prototype.dispatchFile = function(file, options, callback) {
  var self = this;

  async.eachSeries(dispatchers, function(dispatcher, cb) {
    if (options.photo) {
      if (dispatcher.type == 'photo') {
        dispatcher.dispatch(self, file, options, cb);
      } else {
        cb();
      }
    } else {
      dispatcher.dispatch(self, file, options, cb);
    }
  }, function(err) {
    if (err) return callback(err);
    callback();
  });
}

function ellipsisMiddle(str, max_length, first_part, last_part) {
  if (!max_length) max_length = 140;
  if (!first_part) first_part = 40;
  if (!last_part) last_part = 20;
  if (str.length > max_length) {
    return str.substr(0, first_part) + '...' + str.substr(str.length-last_part, str.length);
  }
  return str;
}

function scanDir(abspath, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  if (options.verbose) console.log('Directory:', ellipsisMiddle(abspath));

  var dirlist = [];
  dirlist.push(abspath);

  var filelist = [];
  fs.readdir(abspath, function(err, files) {
    if (err) {
      console.log('readdir failed');
      return callback(err);
    }

    if (options.verbose) console.log('Files:', files.length);

    async.eachSeries(files, function(file, cb) {
      
      if (options.verbose_all) console.log('File:', file);

      if (file.indexOf('.') == 0) {
        return cb();
      }

      var file_abs_path = path.join(abspath, file);

      var stats = undefined;
      try {
        stats = fs.lstatSync(file_abs_path);
      } catch(e) {
        console.log(e);
        return cb();
      }
      if (!stats) return cb();
      
      // console.log(stats);
      if (stats.isFile()) {
        var file_ext = path.extname(file);
        if (!/\.jpg|\.png|\.jpeg|\.gif/.test(file_ext.toLowerCase())) {
          return cb();
        }

        var file_type = path.extname(file).replace('.','');
        var file_info = {
          path: file_abs_path,
          name: file,
          type: file_type,
          size: stats['size'],
          created_date: stats['mtime']
        };

        filelist.push(file_info);
        cb();
      } else if (stats.isDirectory() && options.recursive) {
        if (file.indexOf('_MyPhotos') != -1 || file.indexOf('.myphotoslib') != -1) {
          return cb();
        }

        scanDir(file_abs_path, options, function(err, files, dirs) {
          if (err) return cb(err);

          filelist = filelist.concat(files);
          dirlist = dirlist.concat(dirs);

          cb();
        });
      } else {
        cb();
      }
    }, function(err) {
      callback(err, filelist, dirlist);
    });
  });
}

Scanner.prototype.importFiles = function(files, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  var self = this;

  console.log('Importing files: ' + files.length);
  log.info('Importing files: ' + files.length);

  var errors = [];
  var imported = [];

  var total = files.length;
  var count = 0;

  var threads = options.threads || self._threads || 1;

  async.eachLimit(files, threads, function(file, cb) {
  // async.eachSeries(files, function(file, cb) {
    if (self._stopRequest) {
      log.info('Stop Requested');
      return cb(new Error('Stop Requested'));
    }

    count++;
    
    console.log(count + '/' + total, 'File: ' + file.name + '...');
    
    self.emit('progress', {
      current: count,
      total: total,
      imported: self._currentStats.imported,
      file: file
    });

    var done = function(err, result) {
      var timeout = 500; // delay, do not stress CPU...
      if (result && result.skip) timeout = 10;
      // cb();
      setTimeout(cb, timeout);
    }

    // var time_start = new Date();

    self.dispatchFile(file, options, function(err, result) {
      if (err) {
        console.log('Dispatch error: ' + file.path);
        console.log(err.message);

        log.error('Dispatch error: ' + file.path);
        log.error(err);

        // self.emit('log', err.message);

        errors.push({
          file: file.path,
          error: err.message
        });

        if (options.ignore_errors) {
          // console.log(err);
          return done(null, result);
        }

        return done(err, result);
      }

      // console.log('TIME: dispatchFile', new Date()-time_start);

      if (options.verbose) console.log(count + '/' + total, 'File: ' + file.name + '... Done.');
      log.info(count + '/' + total, 'File: ' + file.name + '... Done.');

      imported.push(file.path);

      var file_path = (options.relative_path) ? path.relative(self._currentScanDir, file.path) : file.path;
      scannerdb.set(file_path, {
        name: file.name,
        type: file.type,
        size: file.size,
        created_date: file.created_date
      }, function(err) {
        if (err) {
          console.log('Error');
          console.log(err);
          return done(err);
        }
        done(null, result);
      });
    });
  }, function(err) {

    var result = {
      input_dir: self._currentScanDir,
      dirs: self._currentDirs.length,
      files: self._currentFiles.length,
      imported: imported.length,
      errors: errors.length
    };

    self.emit('stopped', err, result);

    callback(err, result);
  });
}

Scanner.prototype.scan = function(input_dir, options, callback) {
  var self = this;

  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  options = options || {};
  callback = callback || function(err) {};

  md5cache.setRootDirectory(input_dir);

  self._stopRequest = false;

  console.log('Scanning files...');
  log.info('Scanning files...');

  self.emit('started');

  self._currentScanDir = input_dir;
  self._currentStats = {};
  self._currentStats.imported = 0;
  
  var time_start = new Date();

  scanDir(input_dir, options, function(err, files, dirs) {
    if (err) {
      console.log('Scan error');
      console.log(err);

      log.error('Scan error');
      log.error(err);

      self.emit('error', err);
      return callback(err);
    }

    console.log('TIME: scanDir', new Date()-time_start);

    console.log(dirs.length + ' directories, ' + files.length + ' files');

    log.info('Total dirs: ' + dirs.length);
    log.info('Total files: ' + files.length);

    self._currentFiles = files;
    self._currentDirs = dirs;

    var filelist = [];

    async.eachSeries(files, function(file, cb) {
      scannerdb.get(file.path, function(err, value) {
        if (err) {
          console.log('Error');
          return cb(err);
        }

        if (value && !options.rescan) {
          if (options.verbose) console.log('Already imported: ', file.path);
          // log.info('Already imported: ', file.path);
          return cb();
        }

        if (options.relative_path) {
          var file_path = path.relative(self._currentScanDir, file.path);
          scannerdb.get(file_path, function(err, value) {
            if (err) {
              console.log('Error');
              return cb(err);
            }

            if (value && !options.rescan) {
              if (options.verbose) console.log('Already imported: ', file.path);
              // log.info('Already imported: ', file.path);
              return cb();
            }

            filelist.push(file);
            cb();
          });
        } else {
          filelist.push(file);
          cb();
        }
      });
    }, function(err) {
      if (err) {
        console.log('Error');
        console.log(err);
        return callback(err);
      }

      time_start = new Date();
      self.importFiles(filelist, options, function(err) {
        console.log('TIME: importFiles', new Date()-time_start);
        callback(err);
      });
    });
  });
}

Scanner.prototype.stopScan = function() {
  this._stopRequest = true;
}

module.exports = Scanner;