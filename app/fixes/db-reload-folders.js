var async = require('async');
var fse = require('fs-extra');
var fs = require('fs');

var config = require('../config');

if (fs.existsSync(config.getDatabasePath('folders.db'))) {
  fse.copySync(config.getDatabasePath('folders.db'), config.getDatabasePath('folders.db.bak'), {overwrite: true});
  fse.removeSync(config.getDatabasePath('folders.db'));
}

var db = require('../db');

var updatePhotoFolders = function(skip, limit, callback) {
  db.getPhotos({}, {skip: skip, limit: limit}, function(err, photos) {
    if (err) return callback(err);
    var count = 0;
    async.eachSeries(photos, function(photo, cb) {
      
      
      async.series([
        // function(cb2) { db.updatePhotoAlbum(photo.album, cb2); },
        // function(cb2) { db.updatePhotoCollections(photo.collections, cb2); },
        function(cb2) { db.updatePhotoDateStats(photo, cb2); },
        function(cb2) { db.updatePhotoTagStats(photo, cb2); },
      ], function(err) {
        if (err) console.log(err.message);
        else {
          count++;
          console.log('Updated ' + (skip+count) + ' - ' + photo.name);
        }
        cb();
      });
    }, function(err) {
      if (err) console.log(err.message);
      callback(err, photos.length);
    });
  })
}

var skip = 0;
var limit = 1000;

var onUpdated = function(err, photos_count) {
  if (err) {
    console.log(err);
    process.exit();
  } else if (photos_count == limit) {
    setTimeout(function() {
      skip = skip + limit;
      updatePhotoFolders(skip, limit, onUpdated);
    }, 1000);
  } else {
    console.log('Done.');
    process.exit();
  }
};

updatePhotoFolders(skip, limit, onUpdated);