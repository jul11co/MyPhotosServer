// databases/favorite.js

var async = require('async');

var Datastore = require('nedb');

var config = require('../config');
var utils = require('../utils');

var db = require('../db');

var favoritedb = null;

/* Favorites */

exports.load = function() {
  favoritedb = new Datastore({
    filename: config.getDatabasePath('favorites.db'),
    autoload: true
  });
  favoritedb.ensureIndex({ fieldName: 'item_id' }, function (err) {
    if (err) console.log(err);
  });
}

exports.close = function() {
  favoritedb = null;
}

exports.isFavorited = function(item_type, item_id, callback) {
  favoritedb.findOne({item_type: item_type, item_id: item_id}, function(err, entry) {
    if (err) return callback(err);
    if (entry) return callback(null, true, entry);
    callback(null, false);
  });
}

exports.getFavoriteEntry = function(entry_id, callback) {
  favoritedb.findOne({_id: entry_id}, function(err, entry) {
    return callback(err, entry);
  });
}

// item_info object
// {
//   item_type: String, // 'photo', 'folder', 'collection'
//   item_id: String
// }
exports.addToFavorites = function(item_info, callback) {
  // console.log('addToFavorites:', item_info);
  favoritedb.findOne({
    item_type: item_info.item_type, 
    item_id: item_info.item_id
  }, function(err, oldEntry) {
    if (err) return callback(err);
    if (oldEntry) {
      return callback(null, oldEntry);
    }
    
    var entry = {};
    entry.item_type = item_info.item_type;
    entry.item_id = item_info.item_id;

    entry.added_at = new Date();
    favoritedb.insert(entry, function(err, newEntry) {
      callback(err, newEntry);
    });
  });
}

exports.removeFromFavorites = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  favoritedb.remove(condition, options, function(err, numRemoved) {
    callback(err, numRemoved);
  });
}

exports.getFavoritesCount = function(condition, callback) {
  if (typeof condition == 'function') {
    callback = condition;
    condition = {};
  }
  favoritedb.count(condition, function(err, count) {
    callback(err, count || 0);
  });
}

exports.getFavorites = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var list_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var list_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var list_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};

  var condition = {};
  if (options.type) condition.item_type = options.type;

  favoritedb.count(condition, function(err, total) {
    if (err) return callback(err);

    favoritedb.find(condition).sort(list_sort).skip(list_skip).limit(list_limit).exec(function(err, entries) {
      if (err) return callback(err);

      var result = {
        total: total,
        skip: list_skip,
        limit: list_limit,
        photos: [],
        folders: [],
        collections: []
      };
      // if (options.type == 'photo') result.photos = []; 
      // if (options.type == 'folder') result.folders = []; 
      // if (options.type == 'collection') result.collections = []; 

      async.each(entries, function(entry, cb) {
        if (entry.item_type == 'photo') {
          db.getPhoto({_id: entry.item_id}, function(err, photo) {
            if (!photo) return exports.removeFromFavorites({_id: entry._id}, cb);
            // entry.photo = photo;
            photo.fav_id = entry._id;
            photo.fav_added_at = entry.added_at;
            result.photos.push(photo);
            cb();
          });
        } else if (entry.item_type == 'folder') {
          db.getFolder({_id: entry.item_id}, function(err, folder) {
            if (!folder) return exports.removeFromFavorites({_id: entry._id}, cb);
            // entry.folder = folder;
            folder.fav_id = entry._id;
            folder.fav_added_at = entry.added_at;
            result.folders.push(folder);
            cb();
          });
        } else if (entry.item_type == 'collection') {
          db.getCollection({_id: entry.item_id}, function(err, collection) {
            if (!collection) return exports.removeFromFavorites({_id: entry._id}, cb);
            // entry.collection = collection;
            collection.fav_id = entry._id;
            collection.fav_added_at = entry.added_at;
            result.collections.push(collection);
            cb();
          });
        } else {
          cb();
        }
      }, function(err) {
        if (err) return callback(err);
        callback(null, result);
      });
    });
  });
}

