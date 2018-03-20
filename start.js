#!/usr/bin/env node

var path = require('path');

var utils = require('./app/utils');

function printUsage() {
  console.log('myphotos-server - version ' + require('./package.json')['version']);
  console.log('');
  console.log('Usage:');
  console.log('    myphotos-server <PHOTOS-DIRECTORY> [OPTIONS]');
  console.log('    myphotos-server <PHOTOS-DIRECTORY> --data-dir=<DATA-DIRECTORY> [OPTIONS]');
  console.log('    myphotos-server <PHOTOS-DIRECTORY> --data-pack=<PATH/TO/PHOTOS.myphotoslib> [OPTIONS]');
  console.log('    myphotos-server <PHOTOS-DIRECTORY> --create-photos-lib [OUTPUT-DIRECTORY] [OPTIONS]');
  console.log('');
  console.log('    myphotos-server <PATH/TO/PHOTOS.myphotoslib> [OPTIONS]');
  console.log('    myphotos-server <PATH/TO/PHOTOS.myphotoslib> --update [OPTIONS]');
  console.log('    myphotos-server <PATH/TO/PHOTOS.myphotoslib> --generate-index');
  console.log('');
  console.log('OPTIONS:');
  console.log('');
  console.log('  --no-open                    : do not automatically open in web browser');
  console.log('  --no-import                  : do not automatically import photos');
  console.log('  --no-thumbnails              : do not automatically generate photo thumbnails');
  console.log('');
  console.log('  --port=NUMBER                : set custom listen port (default: 31114)');
  console.log('');
  console.log('IMPORT OPTIONS:');
  console.log('');
  console.log('  --auto-collection            : automatically create collection (from folder name)');
  console.log('  --collection-name=NAME       : import to specific collection');
  console.log('');
  console.log('  --min-width=NUMBER           : filter photos by minimum width (default: 200)');
  console.log('  --min-height=NUMBER          : filter photos by minimum height (default: 200)');
  console.log('');
  console.log('  --rescan                     : retrieve information from already added files (slower)');
  console.log('');
  console.log('  --threads=NUMBER             : set default number of import threads (default: ' 
    + require('os').cpus().length + ')');
  console.log('');
}

if (process.argv.indexOf('--help') != -1 || process.argv.length < 3) {
  printUsage();
  process.exit();
}

var argv = [];
var options = {};
for (var i = 2; i < process.argv.length; i++) {
  if (process.argv[i].indexOf('--') == 0) {
    var arg = process.argv[i];
    if (arg.indexOf("=") > 0) {
      var arg_kv = arg.split('=');
      arg = arg_kv[0];
      arg = arg.replace('--','');
      arg = utils.replaceAll(arg, '-', '_');
      options[arg] = arg_kv[1];
    } else {
      arg = arg.replace('--','');
      arg = utils.replaceAll(arg, '-', '_');
      options[arg] = true;
    }
  } else {
    argv.push(process.argv[i]);
  }
}

process.on('uncaughtException', function (err) {
  console.log("\nUncaught exception");
  console.error(err.stack);
});

if (argv[0]) {
  var input_path = path.resolve(argv[0]);
  if (path.extname(input_path) == '.myphotoslib') {
    options.photos_lib = input_path;
  } else {
    options.photos_dir = input_path;
  }
}

// --data-dir=<PATH>
if (options.data_dir) {
  options.data_dir = path.resolve(options.data_dir);
}
// --data-pack=<PATH>
if (options.data_pack) {
  options.data_pack = path.resolve(options.data_pack);
}
// --port=<NUM>
if (options.port) {
  options.port = parseInt(options.port);
}
// --threads=<NUM>
if (options.threads) {
  options.threads = parseInt(options.threads);
}
// --min-width=<NUM>
if (options.min_width) {
  options.min_width = parseInt(options.min_width);
}
// --min-height=<NUM>
if (options.min_height) {
  options.min_height = parseInt(options.min_height);
}

if (options.photos_dir && options.create_photos_lib && argv[1]) {
  options.photos_lib_output_dir = path.resolve(argv[1]);
}

// console.log(options);

if (options.photos_lib && options.generate_index) {

  if (!utils.fileExistsSync(options.photos_lib)) {
    console.log('File not found! ' + options.photos_lib);
    process.exit();
  }

  console.log('Photos lib: ' + options.photos_lib);

  var bytes = require('bytes');
  var humanizeDuration = require('humanize-duration');
  var PackFile = require('./lib/pack-file');
  
  var pack_file = new PackFile({ path: options.photos_lib });

  console.log('Generating index...');
  var start_time = new Date();
  pack_file.createIndex({overwrite: true, verbose: true}, function(err) {
    if (err) {
      console.log('Generating index... Error!');
      console.log(err);
      process.exit();
    }
    console.log('Generating index... Done');
    console.log('INDEXING TIME:', humanizeDuration(new Date()-start_time));

    var idx_stats = pack_file.getIndexStats();
    if (idx_stats) {
      console.log('Total entries:', idx_stats.entriesCount);
      console.log('Total size:', bytes(idx_stats.totalSize));
    }

    var idx_file = options.photos_lib + '.idx';
    pack_file.saveIndex(idx_file, function(err) {
      if (err) {
        console.log('Saving index to file... Error!');
        console.log(err);
        process.exit();
      }

      var stat = utils.getStat(idx_file);
      if (stat) {
        console.log('Index file generated:', idx_file, bytes(stat['size']));
      } else {
        console.log('Cannot generate index file!', idx_file);
      }
      process.exit();
    });
  });
} else {

  var server = require('./app/server');

  process.on('SIGINT', function() {
    console.log("\nCaught interrupt signal");
    server.exit(function(success) {
      if (success) process.exit();
    });
  });

  server.init(options, function() {
    server.start(options, function(err, svr, app) {
      // open in browser window
      if (!options.no_open) require("opn")('http://127.0.0.1:' + app.get('port'));
    });
  });
}

