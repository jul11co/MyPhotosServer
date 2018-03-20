// databases/collection.js

var async = require('async');
var Datastore = require('nedb');

var config = require('../config');
var utils = require('../utils');

var db = require('../db');

var collectiondb = null;
var collectiondb_busy = false;

/* Collections */

exports.isBusy = function() {
  return collectiondb_busy;
}

exports.load = function() {
  collectiondb = new Datastore({ 
    filename: config.getDatabasePath('collections.db'), 
    autoload: true
  });
  collectiondb.ensureIndex({ fieldName: 'name', unique: true }, function (err) {
    if (err) console.log(err);
  });
}

exports.close = function() {
  collectiondb = null;
}

// collection_info object
// {
//   name: String,             // REQUIRED
//   description: String,      // OPTIONAL
//   cover: String,            // OPTIONAL
//   tags: [String]            // OPTIONAL
// }
exports.addCollection = function(collection_info, callback) {
  var collection = {};

  if (collection_info.name) collection.name = collection_info.name;
  if (collection_info.description) collection.description = collection_info.description;
  if (collection_info.cover) collection.cover = collection_info.cover;
  if (collection_info.tags) collection.tags = collection_info.tags;

  console.log('DB:', 'New collection:', collection_info.name);
  collection.added_at = new Date();
  collectiondb.insert(collection, function(err, newCol) {
    callback(err, newCol);
  });
}

exports.getCollection = function(condition, callback) {
  collectiondb.findOne(condition, function(err, collection) {
    callback(err, collection);
  });
}

exports.getCollectionsOfPhoto = function(photo, collections_map, callback) {
  if (!photo.collections) return callback();
  var collections = [];
  async.eachSeries(photo.collections, function(collection_id, cb) {
    if (collections_map[collection_id]) {
      collections.push(collections_map[collection_id]);
      return cb();
    }
    exports.getCollection({_id: collection_id}, function(err, collection) {
      if (err) return cb(err);
      if (collection) {
          collections.push(collection);
          if (collection && !collections_map[collection._id]) {
            collections_map[collection._id] = collection;
          }
          cb();
      } else {
        cb();  
      }
    });
  }, function(err) {
    if (err) return callback(err);
    callback(null, collections);
  });
}

exports.getCollections = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  collectiondb.find(condition).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, collections) {
    callback(err, collections);
  });
}

exports.getRecentAddedCollections = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  collectiondb.find({}).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, collections) {
    callback(err, collections);
  });
}

exports.getCollectionCount = function(condition, callback) {
  if (typeof condition == 'function') {
    callback = condition;
    condition = {};
  }
  collectiondb.count(condition, function(err, count) {
    callback(err, count || 0);
  });
}

exports.findCollections = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  collectiondb.count(condition, function(err, count) {
    if (err) return callback(err);

    collectiondb.find(condition)
      .sort(result_sort)
      .skip(result_skip).limit(result_limit).exec(function(err, collections) {
      if (err) return callback(err);

      var result = {
        count: count || 0,
        limit: result_limit,
        collections: collections
      };
      callback(null, result);
    });
  });
}

exports.updateCollection = function(condition, update, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  collectiondb.update(condition, update, options, function(err) {
    callback(err);
  });
}

exports.removeCollection = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  collectiondb.remove(condition, options, function(err, numRemoved) {
    callback(err, numRemoved);
  });
}

var updatePhotoCollection = function(collection_id, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  if (!collection_id) return callback();
  // console.log('DB:', 'Update collection:', collection_id);
  exports.getCollection({_id: collection_id}, function(err, collection) {
    if (err) {
      console.log(err);
      return callback(err);
    }
    if (!collection) {
      return callback();
    }
    
    var update = collection;
    var should_update = false;

    // console.log(collection);

    var checkCollectionPhotosCount = function(cb) {
      // update photos_count
      db.getPhotoCount({collections: collection._id}, function(err, count) {
        if (err) return cb(err);
        if (count != collection.photos_count) {
          update.photos_count = count;
          should_update = true;
        }
        cb();
      });
    }

    var checkCollectionPhotosLastCreated = function(cb) {
      // update last_created
      db.getPhotos({collections: collection._id}, {
        limit: 1, sort: {created: -1}
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (collection.last_created && collection.last_created != 0) {
            update.last_created = 0;
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (!collection.last_created || collection.last_created < photo0.created) {
            update.last_created = photo0.created;
            should_update = true;
          }
        }
        cb();
      });
    }

    var checkCollectionPhotosFirstCreated = function(cb) {
      // update first_created
      db.getPhotos({collections: collection._id}, {
        limit: 1, sort: {created: 1}
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (collection.first_created && collection.first_created != 0) {
            update.first_created = 0;
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (!collection.first_created || collection.first_created > photo0.created) {
            update.first_created = photo0.created;
            should_update = true;
          }
        }
        cb();
      });
    }

    var checkCollectionCover = function(cb) {
      // update cover
      db.getPhotos({collections: collection._id}, {
        limit: 1, sort: {created: -1}
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (collection.cover && collection.cover != "") {
            update.cover = "";
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (photo0.thumb && collection.cover != photo0.thumb) {
            update.cover = photo0.thumb;
            should_update = true;
          } else if (!collection.cover 
            || (collection.cover != photo0.thumb && collection.cover != photo0.md5)) {
            update.cover = photo0.md5;// + path.extname(photo0.name);
            should_update = true;
          }
        }
        cb();
      });
    }

    async.series([
      checkCollectionPhotosCount,
      checkCollectionPhotosLastCreated,
      checkCollectionPhotosFirstCreated,
      checkCollectionCover,
    ], function(err) {
      if (err) return callback(err);
      if (should_update) {
        console.log('DB:', 'Update collection:', collection._id, collection.name);
        exports.updateCollection({_id: collection._id}, update, callback);
      } else {
        callback();
      }
    });
  })
}

exports.updatePhotoCollection = updatePhotoCollection;

exports.updatePhotoCollections = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var condition = options.condition || {};
  collectiondb.find(condition, function(err, collections) {
    if (err) callback();
    async.eachSeries(collections, function(collection, cb) {
      updatePhotoCollection(collection._id, options, cb);
    }, callback);
  });
}

var updateCollections = function(collection_ids, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  if (!collection_ids) return callback();
  async.eachSeries(collection_ids, function(collection_id, cb) {
    updatePhotoCollection(collection_id, cb);
  }, callback);
}

exports.updateCollections = updateCollections;
