// dispatchers/photo.js

var path = require('path');
var fs = require('fs');

var photo_file = require('../../lib/photo-file');

var PhotoDispatcher = function() {
  this.type = 'photo';
}

PhotoDispatcher.prototype.dispatch = function(scanner, file, options, callback) {
  var file_name = file.name;
  var file_ext = path.extname(file_name);
  if (!/\.jpg|\.png|\.jpeg|\.gif/.test(file_ext.toLowerCase())) {
    return callback(null, {skip: true});
  }
  
  var photo_info = {
    path: file.path,
    name: file.name,
    size: file.size
  };

  if (file.created_date) {
    photo_info.created = file.created_date;
  }

  var getPhotoInfoFunc = photo_file.getInfoAndGenerateThumbImage;
  if (options.no_thumbnails) {
    getPhotoInfoFunc = photo_file.getInfo;
  }

  getPhotoInfoFunc(file.path, {
    outputdir: scanner.getDataPath(path.join('cache','thumbs')),
    thumb_width: 256,
    thumb_height: 256,
    min_width: options.photo_min_width,
    min_height: options.photo_min_height
  }, function(err, info) {
    if (err) {
      // scanner.emit('log', err.message);
      console.log(err.message);
      scanner.log.error(err);
      return callback(err);
    }

    if (info.width < options.photo_min_width || info.height < options.photo_min_height) {
      return callback(null, {skip: true});
    }

    if (info['type']) photo_info.type = info['type'];
    if (info['md5sum']) photo_info.md5 = info['md5sum'];

    if (info['width']) photo_info.w = info['width'];
    if (info['height']) photo_info.h = info['height'];
    if (info['depth']) photo_info.d = info['depth'];

    if (info['thumb_image']) photo_info.thumb_file = info['thumb_image'];

    if (options.photo_collection_name) {
      photo_info.collection = options.photo_collection_name;
    } else if (options.photo_auto_collection) {
      photo_info.collection = path.basename(path.dirname(photo_info.path));
    }

    var import_data = {
      photo: photo_info
    };
    
    // console.log(import_data);

    scanner.importPhoto(import_data, options, function(err, newphoto) {
      if (err) {
        console.log(err);
      }
      return callback(err, newphoto);
    });
  });
}

module.exports = PhotoDispatcher;
