// databases/photo.js

var path = require('path');
var async = require('async');

var sqlite3 = require('sqlite3');

var config = require('../config');
var utils = require('../utils');
var db = require('../db');

var photodb = null;
var photodb_busy = false;

/* Photos */

exports.isBusy = function() {
  return photodb_busy;
}

exports.load = function() {
  var db_file = config.getDatabasePath('photos-sqlite.db');
  // console.log('Load DB:', db_file);
  photodb = new sqlite3.Database(db_file, function(err) {
    if (err) {
      console.log('Open database error!', db_file);
      console.log(err);
      return;
    }
    var create_table_stm = 
      "CREATE TABLE IF NOT EXISTS photos(" +
        "_id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "folder TEXT NOT NULL," +
        "name TEXT NOT NULL," +
        "path TEXT," +
        "src TEXT," +
        "type TEXT," +
        "md5 TEXT NOT NULL," +
        "size INTEGER," +
        "w INTEGER," +
        "h INTEGER," +
        "d INTEGER," +
        "thumb TEXT," +
        "collections TEXT," +
        "tags TEXT," +
        "created INTEGER," +
        "added_at INTEGER" +
      ");";
    photodb.run(create_table_stm, function(err) {
      if (err) {
        console.log('Create table photos error!');
        console.log(err);
      }
    });
  });
}

exports.close = function() {
  if (photodb) photodb.close();
}

/// -----

var escapeSQL = function(str) {
  if (!str || str == '') return '';
  str = utils.replaceAll(str, "'", "''");
  return str;
}

var unescapeSQL = function(str) {
  if (!str || str == '') return '';
  str = utils.replaceAll(str, "''", "'");
  return str;
}

var getConditionArray = function(cond_map) {
  var cond_array = [];
  for (var field in cond_map) {
    var value = cond_map[field];
    if (field == 'collections' || field == 'tags') {
      if (typeof value == 'string') cond_array.push(field + " = '" + escapeSQL(value) + "'");
      else cond_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'created' || field == 'added_at') {
      if (typeof value == 'object') {
        if (value.$gte) cond_array.push(field + " >= " + (new Date(value.$gte).getTime()));
        if (value.$gt) cond_array.push(field + " > " + (new Date(value.$gt).getTime()));
        if (value.$lte) cond_array.push(field + " <= " + (new Date(value.$lte).getTime()));
        if (value.$lt) cond_array.push(field + " < " + (new Date(value.$lt).getTime()));
      } else {
        cond_array.push(field + " = " + (new Date(value).getTime()));
      }
    } else if (typeof value == 'object') {
      // TODO: handle this
    } else if (Array.isArray(value)) {
      // TODO: handle this
    } else if (typeof value == 'string') {
      cond_array.push(field + " = '" + escapeSQL(value) + "'");
    } else {
      cond_array.push(field + " = " + value);
    }
  }
  return cond_array;
}

var buildConditionString = function(condition) {
  var condition_str = '';
  if (condition.$and) {
    condition_str = getConditionArray(condition.$and).join(' AND ');
  } else if (condition.$or) {
    condition_str = getConditionArray(condition.$or).join(' OR ');
  } else {
    condition_str = getConditionArray(condition).join(' AND ');
  }
  return condition_str;
}

var buildSearchConditionString = function(query, search_field) {
  var condition_str = '';
  search_field = search_field || 'name';
  var queries = query.split(' ');
  if (queries.length == 1) {
    condition_str = search_field + " LIKE '%" + escapeSQL(query) + "%'";
  } else {
    var cond_array = [];
    queries.forEach(function(q) {
      cond_array.push(search_field + " LIKE '%" + escapeSQL(q) + "%'");
    });
    condition_str = cond_array.join(' AND ');
  }
  return condition_str;
}

var getPhotoFromRow = function(row) {
  if (!row) return {};
  var photo = {};
  for (var field in row) {
    var value = row[field];
    if (field == 'collections' || field == 'tags') {
      if (unescapeSQL(value) != '') {
        photo[field] = unescapeSQL(value).split('|');
      }
    } else if (field == 'created' || field == 'added_at') {
      if (value != 0) {
        var date = new Date();
        date.setTime(value);
        photo[field] = date;
      } else {
        photo[field] = 0;
      }
    } else if (typeof value == 'string') {
      photo[field] = unescapeSQL(value);
    } else {
      photo[field] = value;
    }
  }
  return photo;
}

var insertPhoto = function(photo_info, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var field_names = [];
  var field_values = [];
  for (var field in photo_info) {
    field_names.push(field);
    var value = photo_info[field];
    if (field == 'collections' || field == 'tags') {
      field_values.push(escapeSQL(value.join('|')));
    } else if (field == 'created' || field == 'added_at') {
      if (value != 0) {
        var date = new Date(value);
        field_values.push(date.getTime());
      } else {
        field_values.push(0);
      }      
    } else if (typeof value == 'string') {
      field_values.push(escapeSQL(value));
    } else {
      field_values.push(value);
    }
  }
  var field_placeholders = [];
  for (var i = 0; i < field_names.length; i++) {
    field_placeholders[i] = '?';
  }

  photodb.run(
    "INSERT INTO photos (" + field_names.join(',') + ")"
    + " VALUES (" + field_placeholders.join(',') + ")",
    field_values,
    function(err) {
      if (err) {
        console.log('Insert photo error!');
        console.log(err);
        return done(err);
      } else if (this.lastID) {
        getPhoto({_id: this.lastID}, function(err, newphoto) {
          if (!err && newphoto && newphoto._id) {
            return done(null, newphoto);
          }
          done(null, {_id: this.lastID});
        });
      } else {
        done();
      }
    });
}

exports.insertPhoto = insertPhoto;

var getPhotoById = function(photo_id, done) {
  var query = "SELECT * FROM photos WHERE _id = " + photo_id;
  photodb.get(query, function(err, row) {
    if (err) {
      console.log('Get photo error!');
      console.log('Query:', query);
      console.log(err);
      return done(err);
    } else if (row) {
      return done(null, getPhotoFromRow(row));
    } else {
      return done();
    }
  });
}

var getPhoto = function(condition, done) {
  var condition_str = buildConditionString(condition);
  var query = "SELECT * FROM photos WHERE " + condition_str;
  photodb.get(query, function(err, row) {
    if (err) {
      console.log('Get photo error!');
      console.log('Query:', query);
      console.log(err);
      return done(err);
    } else if (row) {
      return done(null, getPhotoFromRow(row));
    } else {
      return done();
    }
  });
}

var updatePhoto = function(photo_info, update_data, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var update_array = [];
  for (var field in update_data) {
    var value = update_data[field];
    if (field == 'collections' || field == 'tags') {
      update_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'created' || field == 'added_at') {
      if (value != 0) {
        update_array.push(field + " = " + (new Date(value).getTime()));
      } else {
        update_array.push(field + " = 0");
      }
    } else if (typeof value == 'string') {
      update_array.push(field + " = '" + escapeSQL(value) + "'");
    } else {
      update_array.push(field + " = " + value);
    }
  }

  var query = "UPDATE photos SET " + update_array.join(',') + " WHERE _id = " + photo_info._id;
  photodb.run(query, function(err) {
    if (err) {
      console.log('Update photo error!');console.log('Query:', query);
      console.log(err);
    }
    done(err);
  });
}

var updatePhotos = function(condition, update_data, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var update_array = [];
  for (var field in update_data) {
    var value = update_data[field];
    if (field == 'collections' || field == 'tags') {
      update_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'created' || field == 'added_at') {
      if (value != 0) {
        update_array.push(field + " = " + (new Date(value).getTime()));
      } else {
        update_array.push(field + " = 0");
      }
    } else if (typeof value == 'string') {
      update_array.push(field + " = '" + escapeSQL(value) + "'");
    } else {
      update_array.push(field + " = " + value);
    }
  }

  var condition_str = buildConditionString(condition);
  var query = "UPDATE photos SET " + update_array.join(',') + " WHERE " + condition_str;
  photodb.run(query, function(err) {
    if (err) {
      console.log('Update photos error!');console.log('Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

exports.updatePhotos = updatePhotos;

var deletePhoto = function(photo_id, done) {
  var query = "DELETE FROM photos WHERE _id = " + photo_id;
  photodb.run(query, function(err) {
    if (err) {
      console.log('Delete photo error!');console.log('Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

var deletePhotos = function(condition, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }
  var condition_str = buildConditionString(condition);
  var query = "DELETE FROM photos";
  if (condition_str != '') query += " WHERE " + condition_str;
  photodb.run(query, function(err) {
    if (err) {
      console.log('Delete photos error!');console.log('Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

var getPhotoCount = function(condition, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var condition_str = '';
  if (options.search && options.search_query) { // search
    condition_str = buildSearchConditionString(options.search_query, options.search_field);
  } else {
    condition_str = buildConditionString(condition);
  }
  
  var query = "SELECT COUNT(*) FROM photos";
  if (condition_str != '') query += " WHERE " + condition_str;

  photodb.get(query, function(err, row){
    if (err) {
      console.log('Select error!');console.log('Query:', query);
      console.log(err);
      return done(err);
    }
    var count = row['COUNT(*)'] || 0;
    done(null, count);
  });
}

var getPhotos = function(condition, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var cols = "*";
  if (options.projection) {
    var selected_cols = [];
    for (var sort_field in options.sort) {
      if (options.sort[sort_field] == 1) {
        selected_cols.push(sort_field);
      }
    }
    if (selected_cols.length) cols = selected_cols.join(',');
  }

  var query = "SELECT " + cols + " FROM photos";

  var condition_str = '';
  if (options.search && options.search_query) { // search
    condition_str = buildSearchConditionString(options.search_query, options.search_field);
  } else {
    condition_str = buildConditionString(condition);
  }
  if (condition_str != '') query += " WHERE " + condition_str;

  if (options.sort) {
    for (var sort_field in options.sort) {
      if (options.sort[sort_field] == 1) {
        query += " ORDER BY " + sort_field + " ASC";
      } else {
        query += " ORDER BY " + sort_field + " DESC";
      }
    }
  }
  if (options.limit) {
    query += " LIMIT " + options.limit;
  } else {
    query += " LIMIT 30";
  }
  if (options.skip) {
    query += " OFFSET " + options.skip;
  }

  // console.log('Query:', query);
  // if (options.search) {
  //   console.log('Query:', query);
  // }

  photodb.all(query, function(err, rows){
    if (err) {
      console.log('Get photos error!');console.log('Query:', query);
      console.log(err);
      return done(err);
    } else if (rows && rows.length) {
      var photos = [];
      rows.forEach(function(row) {
        photos.push(getPhotoFromRow(row));
      });
      return done(null, photos);
    } else {
      return done(null, []);
    }    
  });
}

var getPhotosSize = function(condition, done) {
  var condition_str = buildConditionString(condition);
  var query = "SELECT SUM(size) FROM photos";
  if (condition_str != '') query += " WHERE " + condition_str;
  photodb.get(query, function(err, row){
    if (err) {
      console.log('Select error!');console.log('Query:', query);
      console.log(err);
      return done(err);
    }
    var total_size = row['SUM(size)'] || 0;
    done(null, total_size);
  });
}

exports.getPhotosSize = getPhotosSize;

////----

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
          CollectionDB.addCollection(collection_info, function(err, newCol) {
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

      getPhoto(condition, function(err, old_photo) {
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
          updatePhoto({_id: old_photo._id}, photo, {}, function(err) {
            // db_listener.emit('photo-updated', old_photo);
            db.triggerDBListener('photo-updated', old_photo);
            cb(err, old_photo);
          });
        } else {
          // console.log('DB:', 'New photo:', photo.name);
          // console.log(photo_info);
          photo.added_at = new Date();
          insertPhoto(photo, function(err, new_photo) {
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
  return getPhoto(condition, callback);
}

exports.getRecentAddedPhotos = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var photo_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var photo_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var photo_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  getPhotos({}, {
    skip: photo_skip,
    limit: photo_limit,
    sort: photo_sort
  }, function(err, photos) {
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
  getPhotos({}, {
    skip: photo_skip,
    limit: photo_limit,
    sort: photo_sort
  }, function(err, photos) {
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
  getPhotos(condition, {
    projection: projection
  }, function(err, photos) {
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
  getPhotoCount(condition, function(err, count) {
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

  getPhotoCount(condition, {
    search: true,
    search_query: options.search_query,
    search_field: options.search_field
  }, function(err, count) {
    if (err) return callback(err);

    getPhotos(condition, {
      search: true,
      search_query: options.search_query,
      search_field: options.search_field,
      skip: photo_skip,
      limit: photo_limit,
      sort: photo_sort
    }, function(err, photos) {
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
          if (err) return cb2();
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
            if (err) return cb2();
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
          if (err) return cb2();
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
  getPhotos(condition, {
    skip: photo_skip,
    limit: photo_limit,
    sort: photo_sort
  }, function(err, photos) {
    if (err) return callback(err);
    if (options.no_populate_photos) return callback(null, photos);

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
  updatePhoto(condition, update, options, function(err) {
    callback(err);
  });
}

exports.removePhoto = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  getPhotos(condition, function(err, photos) {
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
    deletePhotos(condition, options, function(err, numRemoved) {
      callback(err, numRemoved);
    });
  });
}

///---

exports.generatePhotoThumbnail = function(photo, callback) {
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

exports.generatePhotoThumbnails = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var condition = {
    // thumb: {$exists: false}
  }
  getPhotos(condition, function(err, photos) {
    if (err) callback();
    if (!photos || photos.length == 0) return callback();

    console.log('Generate photo thumbnails:', photos.length);
    var count = 0;
    
    async.eachSeries(photos, function(photo, cb) {
      count++;
      console.log('Thumb: ' + count + '/' + photos.length + ' ' + photo.name);
      exports.generatePhotoThumbnail(photo, cb);
    }, function(err) {
      console.log('Photo thumbnails generated: ' + count + '/' + photos.length);
      callback(err);
    });
  });
}
