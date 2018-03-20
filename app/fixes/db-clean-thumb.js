var async = require('async');
var fse = require('fs-extra');
var fs = require('fs');

var config = require('../config');

if (fs.existsSync(config.getDatabasePath('photos.db'))) {
  fse.copySync(config.getDatabasePath('photos.db'), config.getDatabasePath('photos.db.bak'), {overwrite: true});
}

var db = require('../db');

var removePhotoThumbs = function(skip, limit, callback) {
  db.getPhotos({}, {skip: skip, limit: limit}, function(err, photos) {
    if (err) return callback(err);
    var count = 0;
    async.eachSeries(photos, function(photo, cb) {
      db.updatePhoto({_id: photo._id}, {$unset: {thumb: true}}, function(err) {
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
      removePhotoThumbs(skip, limit, onUpdated);
    }, 1000);
  } else {
    console.log('Done.');
    process.exit();
  }
};

removePhotoThumbs(skip, limit, onUpdated);