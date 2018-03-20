// databases/photo.js

var path = require('path');
var async = require('async');

var Datastore = require('nedb');

var config = require('../config');
var db = require('../db');

var photodb = null;
var photodb_busy = false;

/* Photos */

exports.isBusy = function() {
  return photodb_busy;
}

exports.load = function() {
  photodb = new Datastore({ 
    filename: config.getDatabasePath('photos.db'),
    autoload: true
  });
  // photodb.ensureIndex({ fieldName: 'md5', unique: true }, function (err) {
  //   if (err) console.log(err);
  // });
  photodb.ensureIndex({ fieldName: 'created' }, function (err) {
    if (err) console.log(err);
  });
  photodb.ensureIndex({ fieldName: 'added_at' }, function (err) {
    if (err) console.log(err);
  });
}

exports.close = function() {
  photodb = null;
}

// photo object
// {
//   folder: String           // REQUIRED (folder path, if no path or src)
//   path: String,            // REQUIRED (if no src)
//   src: String,             // REQUIRED (if no path - for internet photos)
//   name: String,            // REQUIRED
//   
//   type: String,            // OPTIONAL ('jpeg', 'png', 'gif', ...)
//   md5: String,             // REQUIRED
//   size: Number,            // REQUIRED, in bytes
//   thumb: String,           // OPTIONAL (manage by md5 and type)
//   w: Number,               // OPTIONAL (width)
//   h: Number,               // OPTIONAL (height)
//   d: Number,               // OPTIONAL (depth)
//   created: Date            // OPTIONAL
//   tags: [String],          // OPTIONAL
//   
//   collection: String       // OPTIONAL (collection name)
//   collections: [String]    // OPTIONAL (collection names)
// }
exports.addPhoto = function(photo_info, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  async.waterfall([
    function(cb) {
      if (!photo_info.folder) return cb(null, {});

      db.getFolderByPath(photo_info.folder, function(err, folder) {
        if (err) return cb(err);
        if (folder) {
          return cb(null, {folder: folder});
        }
        console.log('DB:','Folder not found:', photo_info.folder);
        return cb(null, {});
      });
    },
    function(data, cb) {
      if (!photo_info.collection && !photo_info.collections) return cb(null, data);

      var checkCollection = function(collection_name, cb2) {
        db.getCollection({name: collection_name}, function(err, collection) {
          if (err) return cb2(err);
          if (collection) {
            return cb2(null, collection);
          }
          // return cb(new Error('No collection available'));
          var collection_info = { name: collection_name };
          if (photo_info.thumb) {
            collection_info.cover = photo_info.thumb;
          } else {
            collection_info.cover = photo_info.md5;// + path.extname(photo_info.name);
          }
          db.addCollection(collection_info, function(err, newCol) {
            return cb2(err, newCol);
          });
        });
      }

      if (photo_info.collection) {
        checkCollection(photo_info.collection, function(err, collection) {
          if (err) return cb(err);
          data.collections = [collection];
          cb(null, data);
        })
      } else if (photo_info.collections) {
        var collections = [];
        async.eachSeries(photo_info.collections, function(collection_name, cb2) {
          checkCollection(collection_name, function(err, collection) {
            if (err) return cb2(err);
            collections.push(collection);
            cb2();
          }, function(err) {
            if (err) return cb(err);
            data.collections = collections;
            cb(null, data);
          });
        });
      }
    },
    function(data, cb) {
      var condition = {};

      if (data.folder && data.folder._id) {
        condition.folder = data.folder._id;
        condition.name = photo_info.name;
      } else if (photo_info.path) {
        condition.path = photo_info.path;
      } else if (photo_info.src) {
        condition.src = photo_info.src;
      }

      // console.log('Import:', condition);

      exports.getPhoto(condition, function(err, old_photo) {
        if (err) return cb(err);

        if (old_photo && !options.force_update) {
          if (old_photo.path && photo_info.path && old_photo.path == photo_info.path) {
            console.log('DB:', 'Already added:', old_photo.path);
            return cb(null, old_photo);
          } else if (old_photo.folder && photo_info.folder && data.folder
            && old_photo.folder == data.folder._id && old_photo.name == photo_info.name) {
            console.log('DB:', 'Already added:', old_photo.name);
            return cb(null, old_photo);
          } else if (old_photo.src && photo_info.src && old_photo.src == photo_info.src) {
            console.log('DB:', 'Already added:', old_photo.src);
            return cb(null, old_photo);
          } else {
            console.log('DB:', 'Duplicated with:', old_photo._id, old_photo.name);
            return cb(null, old_photo);
          }
        }
        
        var photo = {};

        if (old_photo) {
          photo = old_photo;
        }

        // md5

        if (photo_info.md5) {
          photo.md5 = photo_info.md5;
        }

        if (data.folder && data.folder._id) photo.folder = data.folder._id;

        if (data.collections && data.collections.length) {
          photo.collections = [];
          data.collections.forEach(function(collection) {
            photo.collections.push(collection._id);
          });
        }

        // file info

        if (photo_info.path && !photo.folder) photo.path = photo_info.path;
        if (photo_info.src) photo.src = photo_info.src;

        if (photo_info.name) {
          photo.name = photo_info.name;
        } else if (photo_info.path) {
          photo.name = path.basename(photo_info.path);
        }

        if (photo_info.type) {
          photo.type = photo_info.type;
        } else if (photo_info.path) {
          photo.type = path.extname(photo_info.path);
        }

        if (photo_info.size) photo.size = photo_info.size;

        // photo info

        if (photo_info.thumb) photo.thumb = photo_info.thumb;
        if (photo_info.w) photo.w = photo_info.w;
        if (photo_info.h) photo.h = photo_info.h;
        if (photo_info.d) photo.d = photo_info.d;

        if (photo_info.created) photo.created = photo_info.created;

        if (photo_info.tags) photo.tags = photo_info.tags;

        if (old_photo) {
          // console.log('DB:', 'Update photo:', old_photo.name);
          // console.log(photo_info);
          photo.added_at = old_photo.added_at;
          photodb.update({_id: old_photo._id}, photo, {}, function(err) {
            // db_listener.emit('photo-updated', old_photo);
            db.triggerDBListener('photo-updated', old_photo);
            cb(err, old_photo);
          });
        } else {
          // console.log('DB:', 'New photo:', photo.name);
          // console.log(photo_info);
          photo.added_at = new Date();
          photodb.insert(photo, function(err, new_photo) {
            // db_listener.emit('photo-added', new_photo);
            db.triggerDBListener('photo-added', new_photo);
            cb(err, new_photo);
          });
        }
      });
    }
  ], function(err, newPhoto) {
    callback(err, newPhoto);
  });
}

exports.getPhoto = function(condition, callback) {
  photodb.findOne(condition, function(err, photo) {
    callback(err, photo);
  });
}

exports.getRecentAddedPhotos = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var photo_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var photo_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var photo_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  photodb.find({}).sort(photo_sort).skip(photo_skip).limit(photo_limit).exec(function(err, photos) {
    if (err) return callback(err);
      
    exports.populatePhotos(photos, options, function(err, photos) {
      callback(err, photos);
    });
  });
}

exports.getRecentCreatedPhotos = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var photo_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var photo_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var photo_sort = (typeof options.sort != 'undefined') ? options.sort : {created: -1};
  photodb.find({}).sort(photo_sort).skip(photo_skip).limit(photo_limit).exec(function(err, photos) {
    if (err) return callback(err);
      
    exports.populatePhotos(photos, options, function(err, photos) {
      callback(err, photos);
    });
  });
}

exports.getAllPhotos = function(condition, projection, callback) {
  if (typeof projection == 'function') {
    callback = projection;
    projection = {};
  }
  photodb.find(condition, projection, function(err, photos) {
    if (err) return callback(err);
    callback(null, photos);
  });
}

// to get photos count of folder: condition = {folder: folder_id}
exports.getPhotoCount = function(condition, callback) {
  if (typeof condition == 'function') {
    callback = condition;
    condition = {};
  }
  photodb.count(condition, function(err, count) {
    callback(err, count || 0);
  });
}

exports.findPhotos = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var photo_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var photo_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var photo_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  photodb.count(condition, function(err, count) {
    if (err) return callback(err);

    photodb.find(condition)
      .sort(photo_sort)
      .skip(photo_skip).limit(photo_limit).exec(function(err, photos) {
      if (err) return callback(err);

      var result = {
        count: count || 0,
        limit: photo_limit,
        photos: photos
      };
      callback(null, result);
    });
  });
}

exports.populatePhotos = function(photos, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  async.series([
    function(cb) {
      var folders_map = {};
      async.eachSeries(photos, function(photo, cb2) {
        db.getFolderOfPhoto(photo, folders_map, function(err, folder) {
          if (err) cb2();
          if (folder) photo._folder = folder;
          cb2();
        });
      }, cb);
    },
    function(cb) {
      if (options.populate_collections) {
        var collections_map = {};
        async.eachSeries(photos, function(photo, cb2) {
          db.getCollectionsOfPhoto(photo, collections_map, function(err, collections) {
            if (err) cb2();
            if (collections) photo._collections = collections;
            cb2();
          });
        }, cb);
      } else {
        cb();
      }
    },
    function(cb) {
      async.eachSeries(photos, function(photo, cb2) {
        db.isFavorited('photo', photo._id, function(err, favorited, faventry) {
          if (err) cb2();
          if (favorited) photo.favorited = true;
          if (faventry) {
            photo.fav_id = faventry._id;
            photo.fav_added_at = faventry.added_at
          }
          cb2();
        });
      }, cb);
    }
  ], function(err) {
    callback(err, photos);
  });
}

// get photos
// get photos of a folder: condition = {folder: folder_id}
// get photos of a collection: condition = {collections: collection_id}
exports.getPhotos = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var photo_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var photo_limit = (typeof options.limit != 'undefined') ? options.limit : 10;
  var photo_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  photodb.find(condition)
    .sort(photo_sort)
    .skip(photo_skip).limit(photo_limit).exec(function(err, photos) {
      if (err) return callback(err);

      exports.populatePhotos(photos, options, function(err, photos) {
        callback(err, photos);
      });
  });
}

exports.updatePhoto = function(condition, update, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  photodb.update(condition, update, options, function(err) {
    callback(err);
  });
}

exports.removePhoto = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  photodb.find(condition, function(err, photos) {
    if (err) return callback(err);
    if (photos && photos.length) {
      var removed_photos = photos.map(function(photo) {
        return {
          name: photo.name, 
          created: photo.created, 
          tags: photo.tags || []
        };
      });
      // db_listener.emit('photos-removed', removed_photos);
      db.triggerDBListener('photos-removed', removed_photos);
    }
    photodb.remove(condition, options, function(err, numRemoved) {
      callback(err, numRemoved);
    });
  });
}
