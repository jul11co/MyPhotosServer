// app/server.js

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var logger = require('morgan');

var fse = require('fs-extra');
var opn = require('opn');
var bytes = require('bytes');
var humanizeDuration = require('humanize-duration');

var JobQueue = require('jul11co-jobqueue');
var fork = require('child_process').fork;

var config = require('./config');
var db = require('./db');
var utils = require('./utils');

var PackFile = require('../lib/pack-file');
var photo_file = require('../lib/photo-file');

var app = express();
var app_listen_port = process.env.PORT || 31114;

var data_pack = null;
var update_photos_lib = false;
var create_photos_lib = false;
var exiting = false;
var autoimport_enable = false;

var extracted_names = {};
var extract_queue = new JobQueue();

exports.getListenPort = function() {
  return app_listen_port;
}

exports.setListenPort = function(port) {
  app_listen_port = port;
}

exports.init = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  if (options.photos_dir && !options.data_pack && options.create_photos_lib) {
    create_photos_lib = true;
  }
  if ((options.photos_dir && options.data_pack) || (options.photos_lib && options.update)){
    update_photos_lib = true;
  }
  if (!options.no_import) {
    if (options.photos_lib && update_photos_lib) {
      autoimport_enable = true;
    } else if (options.photos_dir && !options.data_pack) {
      autoimport_enable = true;
    }
  }

  if (options.photos_lib) {
    data_pack = new PackFile({path: options.photos_lib});
  } if (options.data_pack) {
    data_pack = new PackFile({path: options.data_pack});
  } else if (!create_photos_lib) {
    // default data_dir (if not specified)
    if (options.photos_dir && !options.data_dir) {
      options.data_dir = path.join(options.photos_dir, '_MyPhotos');
    }
    // set data dir
    if (options.data_dir && options.data_dir != config.getDataDirectory()) {
      config.setDataDirectory(options.data_dir, true);
      // reload databases because of data dir changed
      db.reloadDatabases();
    }
    // set photos dir
    if (options.photos_dir && options.photos_dir != config.getPhotosDirectory()) {
      config.setPhotosDirectory(options.photos_dir);
    }
    // clear cache (inside data dir)
    fse.emptyDir(config.getCacheRoot(), function(err) {
      if (err) console.log(err);
      // else console.log('Cache folder cleared.');
    });
  }

  if (options.verbose) {
    app.use(logger('dev'));
  }

  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  // app.use(express.static(config.getDataDirectory()));
  // app.use(express.static(config.getCacheRoot()));

  app.use(function (req, res, next) {
    if (exiting) {
      return res.status(404).send();
    } else {
      next();
    }
  });

  require('./routes')(app);

  // POST /open_file?path=...
  app.post('/open_file', function(req, res) {
    opn(req.query.path, {wait: false});
    res.status(200).send({ok:1});
  });
  // POST /open_location?path=...
  app.post('/open_location', function(req, res) {
    opn(req.query.path, {wait: false});
    res.status(200).send({ok:1});
  });

  // GET /thumbs/:thumb_id
  app.get('/thumbs/:thumb_id', function(req, res, next) {
    getThumbnailFile(req.params.thumb_id, function(thumb_file_path) {
      if (!thumb_file_path) return res.status(404).send();
      return res.sendFile(thumb_file_path);
    });
  });

  // GET /covers/:cover_id
  app.get('/covers/:cover_id', function(req, res, next) {
    getThumbnailFile(req.params.cover_id, function(thumb_file_path) {
      if (!thumb_file_path) return res.status(404).send();
      return res.sendFile(thumb_file_path);
    });
  });

  // GET /photos/:photo_id/thumb
  app.get('/photos/:photo_id/thumb', function(req, res, next) {
    db.getPhoto({_id: req.params.photo_id}, function(err, photo) {
      if (err) return next(err);
      if (!photo) {
        return next(new Error('The photo is not available'));
      }
      getThumbnailFile(photo.thumb || photo.md5, function(thumb_file_path) {
        if (!thumb_file_path) {
          generatePhotoThumbnail(photo, function(err, photo_thumb_path) {
            if (err) return res.status(404).send();
            return res.sendFile(photo_thumb_path);
          });
        } else {
          return res.sendFile(thumb_file_path);
        }
      });
    });
  });

  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      message: err.message,
      error: err
    });
  });

  app_listen_port = options.port || app_listen_port;
  app.set('port', app_listen_port);

  if (data_pack) { // if data_pack is specified, data_dir will be in cache
    createCacheForDataPack(options, callback);
  } else if (create_photos_lib && options.photos_dir) {
    createNewDataPack(options, callback);
  } else {
    callback();
  }
}

var createCacheForDataPack = function(options, callback) {
  var pack_path = data_pack.path();
  var data_dir = path.join(config.getConfigDirectory(), 'caches', utils.md5Hash(pack_path));
  fse.ensureDirSync(data_dir);
  // extract settings & databases
  data_pack.extractEntries([
    'databases/collections.db',
    'databases/favorites.db',
    'databases/folders-sqlite.db',
    'databases/folders.db',
    'databases/md5cache.db',
    'databases/photodates.db',
    'databases/photos-sqlite.db',
    'databases/photos.db',
    'databases/phototags.db',
    'databases/scanner.db',
    'scanner.log',
    'settings.json'
  ], data_dir, {}, function(err, result) {
    if (err) return callback(err);
    // set data dir
    config.setDataDirectory(data_dir, true);
    // set photos dir (if specified)
    if (options.photos_dir && options.photos_dir != config.getPhotosDirectory()) {
      config.setPhotosDirectory(options.photos_dir);
    }
    // clear cache (inside data dir)
    fse.emptyDir(config.getCacheRoot(), function(err) {
      if (err) console.log(err);
      // else console.log('Cache folder cleared.');
    });
    fse.emptyDir(config.getThumbnailsRoot(), function(err) {
      if (err) console.log(err);
    });
    // reload databases because of data dir changed
    db.reloadDatabases();
    callback();
  });
}

var createNewDataPack = function(options, callback) {
  var pack_path = options.photos_dir + '.myphotoslib';
  if (options.photos_lib_output_dir) {
    pack_path = path.join(options.photos_lib_output_dir, path.basename(options.photos_dir) + '.myphotoslib');
  } 
  
  var data_dir = path.join(config.getConfigDirectory(), 'caches', utils.md5Hash(pack_path));
  fse.ensureDirSync(data_dir);
  data_pack = new PackFile({path: pack_path});

  var old_data_dir = path.join(options.photos_dir, '_MyPhotos');
  if (options.data_dir) {
    old_data_dir = options.data_dir;
  }

  if (utils.folderExistsSync(old_data_dir)) {
    console.log('Create/Update MyPhotosLib:', pack_path);
    console.log('Looking for files in: ' + old_data_dir);
    console.log('Please wait...');

    var start_time = new Date();
    // pack files from old data dir
    data_pack.pack(old_data_dir, { 
      ignoreEntries: ['cache'],
      onEntry: function(entry) {
        console.log((entry.type || 'file')[0], entry.path, bytes(entry.size), entry.mode, entry.mtime);
      }
    }, function(err, result) {
      if (err) return callback(err);
      else if (result && result.new) {
        console.log('MyPhotosLib created:', pack_path);
      } else if (result && result.update) {
        console.log('MyPhotosLib updated:', pack_path);
      }
      console.log('Elapsed time:', humanizeDuration(new Date()-start_time));
      // extract database files & settings to new data dir
      data_pack.extractEntries([
        'databases/collections.db',
        'databases/favorites.db',
        'databases/folders-sqlite.db',
        'databases/folders.db',
        'databases/md5cache.db',
        'databases/photodates.db',
        'databases/photos-sqlite.db',
        'databases/photos.db',
        'databases/phototags.db',
        'databases/scanner.db',
        'scanner.log',
        'settings.json'
      ], data_dir, {}, function(err, result) {
        if (err) return callback(err);
        // set data dir
        config.setDataDirectory(data_dir, true);
        // set photos dir (if specified)
        if (options.photos_dir && options.photos_dir != config.getPhotosDirectory()) {
          config.setPhotosDirectory(options.photos_dir);
        }
        // clear cache (inside data dir)
        fse.emptyDir(config.getCacheRoot(), function(err) {
          if (err) console.log(err);
          // else console.log('Cache folder cleared.');
        });
        // fse.emptyDir(config.getThumbnailsRoot(), function(err) {
        //   if (err) console.log(err);
        // });
        // reload databases because of data dir changed
        db.reloadDatabases();
        callback();
      });
    });
  } else {
    // set data dir
    config.setDataDirectory(data_dir, true);
    // set photos dir (if specified)
    if (options.photos_dir && options.photos_dir != config.getPhotosDirectory()) {
      config.setPhotosDirectory(options.photos_dir);
    }
    // clear cache (inside data dir)
    fse.emptyDir(config.getCacheRoot(), function(err) {
      if (err) console.log(err);
      // else console.log('Cache folder cleared.');
    });
    // fse.emptyDir(config.getThumbnailsRoot(), function(err) {
    //   if (err) console.log(err);
    // });
    // reload databases because of data dir changed
    db.reloadDatabases();
    callback();
  }
}

exports.start = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  var importPhotos = function() {
    // console.log('importPhotos');
    if (exports.isImporting()) return;
    if (!config.getPhotosDirectory()) return;
    var import_threads = options.threads || require('os').cpus().length;
    var import_options = {
      data_source: 'localdisk',
      input_dir: config.getPhotosDirectory(),
      photo: true,
      threads: import_threads,
      ignore_errors: true,
      photo_min_width: options.min_width || 200,
      photo_min_height: options.min_height || 200,
      recursive: true,
      relative_path: true,
      photo_auto_collection: options.auto_collection,
      photo_collection_name: options.collection,
      rescan: options.rescan,
      update_path: options.update_path,
      verbose: options.verbose,
      debug: options.debug,
      no_thumbnails: options.no_thumbnails
    };
    exports.importPhotos(import_options, function(err) {
      if (err) {
        console.log('Import photos failed.');
        console.log(err);
      }
    });
  }

  var server = require('http').Server(app);

  var listen_port = options.listen_port || app.get('port');
  if (listen_port != app_listen_port || listen_port != app.get('port')) {
    app_listen_port = listen_port;
    app.set('port', listen_port);
  }

  server.listen(listen_port, function () {
    console.log('MyPhotosServer is listening on http://127.0.0.1:' + app.get('port'));
    startSocketIoServer(server);

    // console.log(options);

    if (autoimport_enable) {
      setTimeout(importPhotos, 10000);
      setInterval(importPhotos, 10*60*1000); // 10 minutes
    } else if (options.generate_thumbnails) {
      setTimeout(function() {
        exports.generateThumbnails({}, function(err) {
          if (err) console.log(err);
        });
      }, 10000);  
    }

    callback(null, server, app);
  }).on('error', function(err) {
    if (err.code == 'EADDRINUSE') {
      setTimeout(function() {
        options.listen_port = listen_port + 1;
        exports.start(options, callback);
      });
    } else {
      console.log(err);
    }
  });
}

exports.exit = function(done) {
  if (db.isBusy()) {
    console.log('DB is busy. Please wait...');
    return done(false);
  }

  console.log('Server exiting...');
  exiting = true;
  db.closeDatabases();

  if (data_pack) {
    console.log('Update MyPhotosLib:', data_pack.path());
    console.log('Please wait...');
    var pack_opts = {
      ignoreEntries: ['cache/'],
      tar_stream: true
    };
    if (!autoimport_enable) {
      pack_opts.ignoreEntries.push('photo_thumbnails/')
    }
    pack_opts.onEntry = function(entry) {
      console.log((entry.type || 'file')[0], entry.path, bytes(entry.size), entry.mode, entry.mtime);
    }
    var start_time = new Date();
    data_pack.pack(config.getDataDirectory(), pack_opts, function(err, result) {
      if (err) console.log(err);
      else if (result && result.new) {
        console.log('MyPhotosLib created:', data_pack.path());
        console.log('Added entries:', result.newEntries, '(' + bytes(result.newSize) + ')');
      } else if (result && result.update) {
        console.log('MyPhotosLib updated:', data_pack.path());
        console.log('Added entries:', result.updateEntries, '(' + bytes(result.updateSize) + ')');
      }
      console.log('Elapsed time:', humanizeDuration(new Date()-start_time));
      // if (!err) fse.removeSync(config.getDataDirectory());
      if (update_photos_lib || create_photos_lib) {
        data_pack.createIndex({overwrite: true, save_to_file: true}, function(err) {
          if (err) console.log('Create index file error! ' + err.message);
          done(true);
        });
      } else {
        done(true);
      }
    });
  } 
  else {
    done(true);
  }
}

/// ---

var io = null;
var import_queue = new JobQueue();

var importer = null;
var importer_running = false;

var import_list = [];
var current_import = null;

var reportStatus = function(event, data) {
  if (event == 'queue') {
    io.emit('importer-queue', data);
  } 
  else if (event == 'processing') {
    io.emit('importer-processing', data);
  } 
  else if (event == 'removed') {
    io.emit('importer-removed', data);
  } 
  else if (event == 'started') {
    io.emit('importer-started');
  } 
  else if (event == 'progress') {
    io.emit('importer-progress', data);
  } 
  else if (event == 'imported') {
    io.emit('importer-imported', data);
  } 
  else if (event == 'error') {
    io.emit('importer-error', data);
  } 
  else if (event == 'stopped') {
    io.emit('importer-stopped', data);
  } 
  else if (event == 'stdout') {
    io.emit('importer-log', data);
  }
}

exports.isImporting = function() {
  return importer_running;
}

var getImportItemIndex = function(added_at) {
  var import_item_index = -1;
  for (var i = 0; i < import_list.length; i++) {
    if (import_list[i].added_at == added_at) {
      import_item_index = i;
      break;
    }
  }
  return import_item_index;
}

var getImportItem = function(added_at) {
  var index = getImportItemIndex(added_at);
  if (index != -1) {
    return import_list[index];
  }
  return null;
}

var startSocketIoServer = function(server) {

  // Initialize socket.io
  io = require('socket.io').listen(server);

  io.on('connection', function(socket) {
    // console.log('new client connected');

    socket.emit('importer-queue', {import_queue: import_list});

    if (importer) {
      if (current_import && current_import.importing) {
        socket.emit('importer-processing', {import_item: current_import});
      }
    }

    socket.on('disconnect', function(){
      // console.log('client disconnected');
    });

    socket.on('start-import', function(data) {
      console.log('start-import', data);
      if (data.options) {

        var import_item = Object.assign({}, data.options);
        import_item.importing = false;
        import_item.added_at = new Date().getTime();
        import_list.push(import_item);

        console.log('Import queue:', import_list.length);
        reportStatus('queue', {import_queue: import_list});

        import_queue.pushJob(import_item, importJob, function(err) {
          if (err) {
            console.log('Import job failed.');
            console.log(err);
          }
        });
      }
    });

    socket.on('stop-import', function(data) {
      console.log('stop-import');
      stopImport();
    });

    socket.on('remove-import', function(data) {
      console.log('remove-import', data.timestamp);
      if (data.timestamp) {
        var item_index = getImportItemIndex(data.timestamp);
        if (item_index != -1) {
          import_list.splice(item_index, 1);
          reportStatus('removed', {item_timestamp: data.timestamp});
        }
      }
    });
  });
}

var startImport = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  if (importer_running) {
    console.log('Importer is already running');
    return;
  }
  options = options || {};
  callback = callback || function(err) {};

  // current_import = Object.assign({}, options);
  current_import = getImportItem(options.added_at) || Object.assign({}, options);

  console.log('Importer running:', options.added_at);

  importer_running = true;

  var args = [];
  args.push('--fork');
  if (options.verbose) args.push('--verbose');

  if (options.photo) args.push('--photo');

  if (options.force_update) args.push('--force-update');
  if (options.ignore_errors) args.push('--ignore-errors');

  if (options.photo_auto_collection) args.push('--photo-auto-collection');
  if (options.photo_collection_name) args.push('--photo-collection-name=' + options.photo_collection_name);
  
  if (options.photo_min_width) args.push('--photo-min-width=' + options.photo_min_width);
  if (options.photo_min_height) args.push('--photo-min-height=' + options.photo_min_height);

  var import_script = __dirname + '/scanner-cli.js';

  if (options.data_source == 'localdisk') { // scanner
    import_script = __dirname + '/scanner-cli.js';
    
    if (options.threads) args.push('--threads=' + options.threads);
    if (options.recursive) args.push('--recursive');
    if (options.relative_path) args.push('--relative-path');
    if (options.rescan) args.push('--rescan');
    if (options.no_thumbnails) args.push('--no-thumbnails');

    args.push(options.input_dir); // require
  } else if (options.data_source != 'localdisk' && options.input_url && options.output_dir) { // importer
    import_script = __dirname + '/importer-cli.js';

    if (options.max_images) args.push('--max-images=' + options.max_images);

    args.push(options.input_url); // require
    args.push(options.output_dir); // require
  }

  args.push('--data-dir=' + config.getDataDirectory());
  args.push('--host=http://127.0.0.1:' + app_listen_port);

  if (options.verbose) {
    console.log('Import arguments:');
    console.log(args);
  }

  if (options.debug) {
    importer = fork(import_script, args, {});
  } else {
    importer = fork(import_script, args, {silent: true});
  }

  if (!options.debug) {
    importer.stdout.on('data', function(data) {
      console.log('IMPORTER: ' + data);
      // reportStatus('stdout', data);
    });
  }

  importer.on('message', function(data) {
    // console.log('IMPORTER: ' + data.event, data.data);
    if (data.event == 'started') {
      current_import.importing = true;
      reportStatus('started', {import_item: current_import});
    } else if (data.event == 'progress' && data.data) {
      current_import.progress = data.data;
      reportStatus('progress', current_import.progress);
    } else if (data.event == 'stopped' && data.data) {
      current_import.result = Object.assign({}, data.data);
      reportStatus('stopped', current_import.result);
    } else {
      reportStatus(data.event, data.data);
    }
  });

  importer.on('error', function(err) {
    console.log('IMPORTER: spawned error!');
    console.log(err.message);
    reportStatus('error', {error:err});
  });

  importer.on('exit', function(code) {
    console.log('IMPORTER: exit with code ' + code);
    if (code) {
      var error = new Error('Importer exit with code ' + code);
      error.code = code;
      reportStatus('error', {error: error});

      // importer = null;
      importer_running = false;

      current_import.importing = false;
      current_import.completed = true;
      current_import.completed_at = new Date();

      callback(error);
    } else {
      reportStatus('stopped');

      // importer = null;
      importer_running = false;

      current_import.importing = false;
      current_import.completed = true;
      current_import.completed_at = new Date();

      if (current_import.result && current_import.result.dirs) {
        console.log(current_import.result.dirs + ' directories, ' + current_import.result.files + ' files.');
        console.log(current_import.result.imported + ' imported.');

        // if (current_import.result.imported) {
        //   setTimeout(function() {
        //     db.updateDatabases();
        //   },1000);
        // }
      }
      callback();
    }
  });
}

var stopImport = function() {
  if (importer_running && importer) {
    importer.send({exit: true});
    // importer = null;
  }
}

var importJob = function(options, done) {
  if (options.data_source == 'localdisk' && options.input_dir) {
    startImport(options, done);
    // done();
  } else if (options.input_url) {
    startImport(options, done);
    // done();
  } else {
    console.log('Missing input dir or input url');
    done();
  }
}

exports.importPhotos = function(options, callback) {
  callback = callback || function(err) {};
  if (db.isBusy()) return callback();

  var import_item = Object.assign({}, options);
  import_item.importing = false;
  import_item.added_at = new Date().getTime();
  import_list.push(import_item);

  console.log('Import queue:', import_list.length);
  reportStatus('queue', {import_queue: import_list});

  import_queue.pushJob(import_item, importJob, function(err) {
    callback(err);
  });
}

/// ---

var getParentPaths = function(_path, parents) {
  var parent = path.dirname(_path);
  if (parent && parent != '' && parent != '.') {
    parents.push(parent);
    getParentPaths(parent, parents);
  }
}

var getThumbnailFile = function(thumbnail_id, callback) {
  if (exiting) return callback();

  var thumb_file_path = config.getThumbnailPath(thumbnail_id);
  var thumb_file_rel_path = path.relative(config.getDataDirectory(), thumb_file_path);
  var cached_thumb_file_path = config.getCachePath(thumb_file_rel_path);

  if (utils.fileExistsSync(thumb_file_path)) {
    return callback(thumb_file_path);
  } else if (utils.fileExistsSync(cached_thumb_file_path)) {
    return callback(cached_thumb_file_path);
  } else if (data_pack) {
    thumb_file_path = config.getCachePath(thumb_file_rel_path);
    // console.log('Thumb path (cached):', cached_thumb_file_path);
    extract_queue.pushJob({
      thumb_file_rel_path: thumb_file_rel_path
    }, function(opts, done) { // handler
      if (exiting) return done();
      // var start_time = new Date();
      data_pack.extractEntry(opts.thumb_file_rel_path, config.getCacheRoot(), {}, function(err) {
        // console.log('EXTRACT TIME:', new Date()-start_time);
        done(err);
      });
    }, function(err) { // complete
      if (err) {
        console.log('Extract error!', thumb_file_rel_path);
        console.log(err);
        return callback();
      }
      if (!utils.fileExistsSync(thumb_file_path)) return callback();
      return callback(thumb_file_path);
    });
  } else {
    // console.log('Thumbnail not found:', thumbnail_id);
    return callback();
  }
}

exports.generateThumbnails = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  callback = callback || function(err) {};
  generatePhotoThumbnails(options, callback);
}

var generatePhotoThumbnail = function(photo, callback) {
  var photo_thumb_file = photo.thumb;

  if (!photo_thumb_file) {
    photo_thumb_file = photo.md5;// + path.extname(photo.name);
  }
  var photo_thumb_path = config.getThumbnailPath(photo_thumb_file);

  if (utils.fileExistsSync(photo_thumb_path)) {
    return callback(null, photo_thumb_path);
  } else {
    db.getFolderOfPhoto(photo, {}, function(err, folder) {
      if (err) return callback(err);

      var unavailable = false;
      var photo_path = photo.path;
      if (folder) { // photo has relative path
        photo_path = path.join(folder.path, photo.name);
        if (!utils.folderExistsSync(folder.path)) {
          unavailable = true;
        }
      } else if (photo_path && photo_path.indexOf('/') == 0) { // photo has absolute path
        if (!utils.fileExistsSync(photo_path)) {
          unavailable = true;
        }
      }

      if (unavailable) {
        return callback(new Error('Photo is not available.'));
      }

      // generate new thumbnail
      photo_file.generateThumbImage(photo_path, photo_thumb_path, {
        thumb_width: 256,
        thumb_height: 256
      }, function(err) {
        if (err) {
          return callback(err);
        }

        if (!utils.fileExistsSync(photo_thumb_path)) {
          return callback(new Error('Cannot generate thumb.'));
        }

        return callback(null, photo_thumb_path);
      });
    });
  }
}

var generatePhotoThumbnails = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var condition = {
    // thumb: {$exists: false}
  }
  db.getAllPhotos(condition, function(err, photos) {
    if (err) callback();
    if (!photos || photos.length == 0) return callback();

    console.log('Generate photo thumbnails:', photos.length);
    var count = 0;
    
    async.eachSeries(photos, function(photo, cb) {
      count++;
      console.log('Thumb: ' + count + '/' + photos.length + ' ' + photo.name);
      generatePhotoThumbnail(photo, cb);
    }, function(err) {
      console.log('Photo thumbnails generated: ' + count + '/' + photos.length);
      callback(err);
    });
  });
}
