#!/usr/bin/env node

var async = require('async');
var fs = require('fs');
var path = require('path');

var JobQueue = require('jul11co-jobqueue');

var photoFile = require('../lib/photo-file');

var gimporter = require('./importer');

function printUsage() {
  console.log('Usage: myphotos-importer [OPTIONS] <INPUT_URL> [OUTPUT_DIR]');
  console.log('');
  console.log('OPTIONS:');
  console.log('');
  console.log('  --photo-auto-collection      : automatically create collection (from folder name or page title))');
  console.log('  --photo-collection-name=NAME : import to specific collection');
  console.log('');
  console.log('  --photo-min-width=NUMBER     : filter photos');
  console.log('  --photo-min-height=NUMBER    : filter photos');
  console.log('');
  console.log('  --force-update               : override previous added information');
  console.log('');
  console.log('  --data-dir=DATA_DIRECTORY    : specify MyPhotosServer\'s data directory');
  console.log('  --host=HOST_URL              : specify which MyPhotosServer will connect to');
  console.log('');
}

function escapeRegExp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replaceAll(string, find, replace) {
  return string.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

var argv = [];
var options = {};
for (var i = 2; i < process.argv.length; i++) {
  if (process.argv[i] == '--photo') {
    options.photo = true;
  } else if (process.argv[i] == '--errors') {
    options.ignore_errors = false;
  } else if (process.argv[i].indexOf('--') == 0) {
    var arg = process.argv[i];
    if (arg.indexOf("=") > 0) {
      var arg_kv = arg.split('=');
      arg = arg_kv[0];
      arg = arg.replace('--','');
      arg = replaceAll(arg, '-', '_');
      options[arg] = arg_kv[1];
    } else {
      arg = arg.replace('--','');
      arg = replaceAll(arg, '-', '_');
      options[arg] = true;
    }
  } else {
    argv.push(process.argv[i]);
  }
}

if (typeof options.ignore_errors == 'undefined') {
  options.ignore_errors = true;
}

if (options.photo_min_width) {
  options.photo_min_width = parseInt(options.photo_min_width);
} else {
  options.photo_min_width = 200;
}
if (options.photo_min_height) {
  options.photo_min_height = parseInt(options.photo_min_height);
} else {
  options.photo_min_height = 200;
}
if (options.max_images) {
  options.max_images = parseInt(options.max_images);
} else {
  options.max_images = 200;
}

if (!argv[0]) {
  printUsage();
  process.exit();
}

var INPUT_URL = argv[0];
console.log('Input URL: ' + INPUT_URL);

var OUTPUT_DIR = argv[1] || '.';
OUTPUT_DIR = path.resolve(OUTPUT_DIR);
console.log('Output dir: ' + OUTPUT_DIR);

if (!options.data_source && INPUT_URL) {
  if (INPUT_URL.indexOf('tumblr.com') > 0) options.data_source = 'tumblr';
  if (INPUT_URL.indexOf('pinterest.com') > 0) options.data_source = 'pinterest';
}

if (options.verbose) console.log(options);

var dataDirectory = options.data_dir || '.';
var getDataPath = function(datapath) {
  return path.join(dataDirectory, datapath);
}

var importers = {};
var result = {
  dirs: 0,
  files: 0,
  imported: 0,
  errors: []
};

fs.readdirSync(path.join(__dirname + '/importers')).forEach(function(file) {
  if (file.indexOf('.js') > 0) {
    // console.log(file);
    var importer = require("./importers/" + file);
    var importer_type = path.basename(file,'.js');
    console.log('Importer registered:', importer_type);
    importers[importer_type] = importer;
  }
});

if (options.host) {
  var importer = require('./importer');
  console.log('MyPhotos host:', options.host);
  importer.setDefaultHost(options.host);
}

var importer = null;
var import_queue = new JobQueue();

if (options.fork) {
  process.on('message', function(data) {
    if (data.exit && importer) {
      importer.stop();
      setTimeout(function() {process.exit(0);},2000);
    }
  });
}

var processReport = function(event, data) {
  if (options.fork && process.send) {
    process.send({
      event: event,
      data: data
    });
  }
}

var importPhoto = function(file_info, done) {
  if (typeof file_info == 'string') {
    var file_path = file_info;
    file_info = {
      path: file_path
    };
  }

  console.log('importPhoto:', file_info.path);

  var stats = undefined;
  try {
    stats = fs.lstatSync(file_info.path);
  } catch(e) {
    console.log(e);
    return done();
  }
  if (!stats) {
    console.log('Cannot get stats');
    return done();
  }
  
  file_info.name = path.basename(file_info.path);

  var file = {
    path: file_info.path,
    name: file_info.name,
    type: path.extname(file_info.name).replace('.',''),
    size: stats['size'],
    created_date: stats['mtime']
  };

  var file_name = file.name;
  var file_ext = path.extname(file_name);
  if (!/\.jpg|\.png|\.jpeg|\.gif/.test(file_ext.toLowerCase())) {
    console.log('Skip:', file_name);
    return done(null, {skip: true});
  }

  photoFile.getInfoAndGenerateThumbImage(file.path, {
    tmpdir: getDataPath(path.join('_cache','tmp')),
    outputdir: getDataPath(path.join('_cache','thumbs')),
    thumb_width: 256,
    thumb_height: 256,
    min_width: options.photo_min_width,
    min_height: options.photo_min_height,
  }, function(err, info) {
    if (err) {
      console.log('Get info and generate thumb failed.');
      console.log(err.message);
      return done(err);
    }

    if (info.width < options.photo_min_width || info.height < options.photo_min_height) {
      console.log('Skip (due to photo dimension):', file.name);
      return done(null, {skip: true});
    }

    var photo_info = {
      name: file.name,
      size: file.size
    };

    photo_info.folder = path.relative(OUTPUT_DIR, path.dirname(file.path));

    if (file.created_date) {
      photo_info.created = file.created_date;
    }

    if (info['type']) photo_info.type = info['type'];
    if (info['md5sum']) photo_info.md5 = info['md5sum'];

    if (info['width']) photo_info.w = info['width'];
    if (info['height']) photo_info.h = info['height'];
    if (info['depth']) photo_info.d = info['depth'];

    if (info['thumb_image']) {
      photo_info.thumb_file = info['thumb_image'];
    }

    if (options.photo_collection_name) {
      photo_info.collection = options.photo_collection_name;
    } else if (options.photo_auto_collection) {
      photo_info.collection = path.basename(path.dirname(photo_info.path));
    }

    // if (photo_info.path && !photo_info.folder && OUTPUT_DIR) {
    //   photo_info.folder = path.resolve(OUTPUT_DIR);
    //   photo_info.path = path.relative(photo_info.folder, photo_info.path);
    // }

    var import_data = {
      photo: photo_info
    };

    if (options.force_update) import_data.force_update = true;
    if (options.update_path) import_data.update_path = true;

    // console.log('Import data:');
    // console.log(import_data);

    // Import to MyPhotos server
    gimporter.importPhoto(import_data, function(err, res) {
      if (err) {
        console.log('Import photo failed.');
        console.log(err);
        result.errors.push(err);
      } else if (res) {
        console.log(res);
        processReport('imported', {
          type: 'photo',
          photo: res
        });
        result.imported++;
      } else {
        processReport('imported', {
          type: 'photo',
          photo: photo_info
        });
        result.imported++;
      }
      return done(err);
    });
  });
}

////

if (options.data_source && importers[options.data_source]) {
  var Importer = importers[options.data_source];

  importer = new Importer();

  importer.on('started', function() {
    console.log('Importer started');
    processReport('started');
  });

  importer.on('file', function(file_info) {
    console.log('file', file_info);
    result.files++;
    import_queue.pushJob(file_info, importPhoto, function(err) {
      if (err) {
        console.log('Import job failed.');
        console.log(err);
      }
    });
  });

  importer.on('progress', function(data) {
    // console.log('Importer progress: ' + data.current + '/' + data.total);
    // console.log(data.file.path);
    data = data || {};
    data.imported = result.imported;
    data.errors = result.errors.length;
    processReport('progress', data);
  });

  // importer.on('imported', function(data) {
  //   console.log('Importer imported: ' + data.type);
  //   processReport('imported', data);
  // });

  importer.on('stopped', function(err, data) {
    console.log('Importer stopped');
    if (data) {
      console.log(data.dirs + ' directories, ' + data.files + ' files.');
      console.log(data.imported + ' imported.');
      if (data.errors.length) {
        console.log(data.errors + ' errors.');
        data.errors.forEach(function(error) {
          console.log(error);
        });
      } else {
        console.log('Done. No errors.');
      }
      if (err) data.err = err;
      processReport('stopped', data);
    } else {
      processReport('stopped', {
        dirs: result.dirs,
        files: result.files,
        imported: result.imported,
        errors: result.errors.length
      });
    }
    setTimeout(function() {process.exit();}, 1000);
  });

  importer.start(INPUT_URL, OUTPUT_DIR, options);
} else {
  console.log('No matched importer:', options.data_source);
  processReport('error', {message: 'No matched importer'});
  process.exit();
}
