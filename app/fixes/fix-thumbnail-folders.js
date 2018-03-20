var fse = require('fs-extra');
var fs = require('fs');
var path = require('path');
var async = require('async');

var config = require('../config');

var dryrun = false;

var filelist = [];
var thumbnails_dir = config.getDataPath('photo_thumbnails');
fs.readdir(thumbnails_dir, function(err, files) {
  if (err) {
    console.log(err);
    process.exit();
  } else {
    console.log('Thumbnails:', files.length - 2);
    var count = 0;
    var total = files.length;
    async.eachSeries(files, function(file, cb) {
      if (file.indexOf('.') == 0) return cb();

      count++;
      var source_file = path.join(thumbnails_dir, file);
      var target_thumb_file = config.getThumbnailPath(file);
      console.log(count + '/' + total + ':', file,'-->', target_thumb_file);
      
      if (dryrun) {
        process.nextTick(cb);
        return;
      }

      fse.ensureDirSync(path.dirname(target_thumb_file));

      fse.move(source_file, target_thumb_file, {overwrite: true}, function(err) {
        if (err) return cb(err);
        process.nextTick(cb);
        // cb();
      });
    }, function(err) {
      if (err) {
        console.log(err);
      }
      console.log('Done.');
      process.exit();
    });
  }
});