// databases/folder.js

var path = require('path');
var async = require('async');

var sqlite3 = require('sqlite3');

var config = require('../config');
var utils = require('../utils');

var db = require('../db');

var folderdb = null;
var folderdb_busy = false;

/* Folders */

exports.isBusy = function() {
  return folderdb_busy;
}

exports.load = function() {
  var db_file = config.getDatabasePath('folders-sqlite.db');
  // console.log('Load DB:', db_file);
  folderdb = new sqlite3.Database(db_file, function(err) {
    if (err) {
      console.log('DB:','Open database error!', db_file);
      console.log(err);
      return;
    }
    var create_table_stm = 
      "CREATE TABLE IF NOT EXISTS folders(" +
        "_id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "path TEXT NOT NULL UNIQUE," +
        "name TEXT NOT NULL," +
        "parent TEXT," +
        "cover TEXT," +
        "is_root INTEGER DEFAULT 0," +
        "photos_count INTEGER DEFAULT 0," +
        "size INTEGER DEFAULT 0," +
        "first_created INTEGER DEFAULT 0," +
        "last_created INTEGER DEFAULT 0," +
        "tags TEXT," +
        "added_at INTEGER" +
      ");";
    folderdb.run(create_table_stm, function(err) {
      if (err) {
        console.log('DB:','Create table folders error!');
        console.log(err);
      }
    });
  });
}

exports.close = function() {
  if (folderdb) folderdb.close();
}

/// ---

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
    if (field == 'tags') {
      if (typeof value == 'string') cond_array.push(field + " = '" + escapeSQL(value) + "'");
      else cond_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'first_created' || field == 'last_created' ||field == 'added_at') {
      if (typeof value == 'object') {
        if (value.$gte) cond_array.push(field + " >= " + (new Date(value.$gte).getTime()));
        if (value.$gt) cond_array.push(field + " > " + (new Date(value.$gt).getTime()));
        if (value.$lte) cond_array.push(field + " <= " + (new Date(value.$lte).getTime()));
        if (value.$lt) cond_array.push(field + " < " + (new Date(value.$lt).getTime()));
      } else {
        cond_array.push(field + " = " + (new Date(value).getTime()));
      }
    } else if (typeof value == 'object') {
      if (field == 'photos_count') {
        if (value.$gte) cond_array.push(field + " >= " + value.$gte);
        if (value.$gt) cond_array.push(field + " > " + value.$gt);
      }
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

var getFolderFromRow = function(row) {
  if (!row) return {};
  var folder = {};
  for (var field in row) {
    var value = row[field];
    if (field == 'tags') {
      if (unescapeSQL(value) != '') {
        folder[field] = unescapeSQL(value).split('|');
      }
    } else if (field == 'first_created' || field == 'last_created' || field == 'added_at') {
      if (value != 0) {
        var date = new Date();
        date.setTime(value);
        folder[field] = date;
      } else {
        folder[field] = 0;
      }      
    } else if (typeof value == 'string') {
      folder[field] = unescapeSQL(value);
    } else {
      folder[field] = value;
    }
  }
  return folder;
}

var insertFolder = function(folder_info, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var field_names = [];
  var field_values = [];
  for (var field in folder_info) {
    field_names.push(field);
    var value = folder_info[field];
    if (field == 'tags') {
      field_values.push(escapeSQL(value.join('|')));
    } else if (field == 'first_created' || field == 'last_created' || field == 'added_at') {
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

  folderdb.run(
    "INSERT INTO folders (" + field_names.join(',') + ")"
    + " VALUES (" + field_placeholders.join(',') + ")",
    field_values,
    function(err) {
      if (err) {
        console.log('DB:','Insert folder error!');
        console.log('DB:',field_values);
        console.log(err);
        return done(err);
      } else if (this.lastID) {
        getFolder({_id: this.lastID}, function(err, newfolder) {
          if (!err && newfolder && newfolder._id) {
            return done(null, newfolder);
          }
          done(null, {_id: this.lastID});
        });
      } else {
        done();
      }
    });
}

exports.insertFolder = insertFolder;

var getFolderById = function(folder_id, done) {
  var query = "SELECT * FROM folders WHERE _id = " + folder_id;
  folderdb.get(query, function(err, row) {
    if (err) {
      console.log('DB:','Get folder error!');
      console.log('DB:','Query:', query);
      console.log(err);
      return done(err);
    } else if (row) {
      return done(null, getFolderFromRow(row));
    } else {
      return done();
    }
  });
}

var getFolder = function(condition, done) {
  var condition_str = buildConditionString(condition);
  var query = "SELECT * FROM folders WHERE " + condition_str;
  folderdb.get(query, function(err, row) {
    if (err) {
      console.log('DB:','Get folder error!');
      console.log('DB:','Query:', query);
      console.log(err);
      return done(err);
    } else if (row) {
      return done(null, getFolderFromRow(row));
    } else {
      return done();
    }
  });
}

var updateFolder = function(folder_info, update_data, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var update_array = [];
  for (var field in update_data) {
    var value = update_data[field];
    if (field == 'tags') {
      update_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'first_created' || field == 'last_created' || field == 'added_at') {
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

  var query = "UPDATE folders SET " + update_array.join(',') + " WHERE _id = " + folder_info._id;
  folderdb.run(query, function(err) {
    if (err) {
      console.log('DB:','Update folder error!');console.log('DB:','Query:', query);
      console.log(err);
    }
    done(err);
  });
}

var updateFolders = function(condition, update_data, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }

  var update_array = [];
  for (var field in update_data) {
    var value = update_data[field];
    if (field == 'tags') {
      update_array.push(field + " = '" + escapeSQL(value.join('|')) + "'");
    } else if (field == 'first_created' || field == 'last_created' || field == 'added_at') {
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
  var query = "UPDATE folders SET " + update_array.join(',') + " WHERE " + condition_str;
  folderdb.run(query, function(err) {
    if (err) {
      console.log('DB:','Update folders error!');console.log('DB:','Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

var deleteFolder = function(folder_id, done) {
  var query = "DELETE FROM folders WHERE _id = " + folder_id;
  folderdb.run(query, function(err) {
    if (err) {
      console.log('DB:','Delete folder error!');console.log('DB:','Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

var deleteFolders = function(condition, options, done) {
  if (typeof options == 'function') {
    done = options;
    options = {};
  }
  var condition_str = buildConditionString(condition);
  var query = "DELETE FROM folders";
  if (condition_str != '') query += " WHERE " + condition_str;
  folderdb.run(query, function(err) {
    if (err) {
      console.log('DB:','Delete folders error!');console.log('DB:','Query:', query);
      console.log(err);
    }
    done(err, this.changes ? this.changes.length : 0);
  });
}

var getFolderCount = function(condition, options, done) {
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
  
  var query = "SELECT COUNT(*) FROM folders";
  if (condition_str != '') query += " WHERE " + condition_str;

  folderdb.get(query, function(err, row){
    if (err) {
      console.log('DB:','Select error!');console.log('DB:','Query:', query);
      console.log(err);
      return done(err);
    }
    var count = row['COUNT(*)'] || 0;
    done(null, count);
  });
}

var getFolders = function(condition, options, done) {
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

  var query = "SELECT " + cols + " FROM folders";

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
  } else if (!options.no_limit) {
    query += " LIMIT 30";
  }
  if (options.skip) {
    query += " OFFSET " + options.skip;
  }

  // if (options.search) {
  //   console.log('Query:', query);
  // }

  folderdb.all(query, function(err, rows){
    if (err) {
      console.log('DB:','Get folders error!');console.log('DB:','Query:', query);
      console.log(err);
      return done(err);
    } else if (rows && rows.length) {
      var folders = [];
      rows.forEach(function(row) {
        folders.push(getFolderFromRow(row));
      });
      return done(null, folders);
    } else {
      return done(null, []);
    }    
  });
}

/// ---

exports.addFolder = function(folder_info, callback) {
  var folder = {};

  if (!folder_info.path) {
    return callback(new Error('Missing folder path'));
  }

  folder.path = folder_info.path;
  folder.name = folder_info.name;
  if (folder_info.parent) folder.parent = folder_info.parent;
  if (folder_info.cover) folder.cover = folder_info.cover;

  if (folder_info.photos_count) folder.photos_count = folder_info.photos_count;
  if (folder_info.size) folder.size = folder_info.size;
  if (folder_info.first_created) folder.first_created = folder_info.first_created;
  if (folder_info.last_created) folder.last_created = folder_info.last_created;

  var tags = folder_info.tags || utils.extractCapitalizedWords(folder_info.name);
  if (tags.length) folder.tags = tags;

  console.log('DB:', 'New folder:', folder.path);
  folder.added_at = folder_info.added_at || new Date();

  insertFolder(folder, function(err, newfolder) {
    callback(err, newfolder);
  })
}

exports.getFolder = function(condition, callback) {
  getFolder(condition, function(err, folder) {
    callback(err, folder);
  });
}

exports.getFolderOfPhoto = function(photo, folders_map, callback) {
  if (!photo.folder) return callback();
  if (folders_map[photo.folder]) {
    return callback(null, folders_map[photo.folder]);
  }
  exports.getFolder({_id: photo.folder}, function(err, folder) {
    if (err) return callback(err);
    if (!folder) return callback(new Error('Folder not found!', photo.folder));

    if (folder && !folders_map[folder._id]) {
      folders_map[folder._id] = folder;
    }
    if (folder.parent) {
      exports.populateParentFolder(folder, folders_map, function(err) {
        if (!err) {
          config.fixFolderPath(folder);
        }
        callback(null, folder);
      });
    } else {
      config.fixFolderPath(folder);
      callback(null, folder);
    }
  });
}

exports.getFolderByPath = function(folder_path, callback) {
  var folder_path_is_absolute = path.isAbsolute(folder_path);
  var folder_abs_path = (folder_path_is_absolute) ? folder_path : config.getPhotosPath(folder_path);
  var folder_rel_path = (folder_path_is_absolute) ? config.getRelativePhotosPath(folder_path) : folder_path;
  
  var is_root = 0;
  if (folder_abs_path == '/' || folder_abs_path == config.getPhotosDirectory()) {
    is_root = 1;
  }
  if (is_root) folder_rel_path = '$ROOT';

  // console.log('DB:', 'getFolderByPath:', folder_rel_path);

  exports.getFolder({path: folder_rel_path}, function(err, folder) {
    if (err) return callback(err);
    
    if (folder) { // existing folder with specified path
      return callback(null, folder);
    } else if (is_root) { // ROOT
      var folder_info = {
        path: '$ROOT',
        name: path.basename(folder_path),
        is_root: 1
      };
      // add ROOT folder
      exports.addFolder(folder_info, function(err, newfolder) {
        return callback(err, newfolder);
      });
    } else {
      var parent_path = path.dirname(folder_path);
      // get parent folder
      exports.getFolderByPath(parent_path, function(err, parent_folder) {
        if (err) return callback(err);
        if (parent_folder) {
          var folder_info = { 
            path: folder_rel_path,
            name: path.basename(folder_path),
            parent: parent_folder._id
          };
          // add new folder
          exports.addFolder(folder_info, function(err, newfolder) {
            return callback(err, newfolder);
          });
        } else {
          console.log('DB:', 'Cannot create parent folder: ' + parent_path);
          return callback(new Error('Cannot create parent folder.'));
        }
      });
    }
  })
}

exports.getFolders = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  getFolders(condition, {
    skip: result_skip,
    limit: result_limit,
    sort: result_sort
  }, function(err, folders) {
    callback(err, folders);
  });
}

exports.getRecentAddedFolders = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  getFolders({}, {
    skip: result_skip,
    limit: result_limit,
    sort: result_sort
  }, function(err, folders) {
    callback(err, folders);
  });
}

exports.getFolderCount = function(condition, callback) {
  if (typeof condition == 'function') {
    callback = condition;
    condition = {};
  }
  getFolderCount(condition, function(err, count) {
    callback(err, count || 0);
  });
}

exports.findFolders = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
  var result_limit = (typeof options.limit != 'undefined') ? options.limit : 20;
  var result_sort = (typeof options.sort != 'undefined') ? options.sort : {added_at: -1};
  getFolderCount(condition, {
    search: true,
    search_query: options.search_query,
    search_field: options.search_field
  }, function(err, count) {
    if (err) return callback(err);

    getFolders(condition, {
      search: true,
      search_query: options.search_query,
      search_field: options.search_field,
      skip: result_skip,
      limit: result_limit,
      sort: result_sort
    }, function(err, folders) {
      if (err) return callback(err);

      var result = {
        count: count || 0,
        limit: result_limit,
        folders: folders
      };
      callback(null, result);
    });
  });
}

exports.updateFolder = function(condition, update, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  updateFolder(condition, update, options, function(err) {
    callback(err);
  });
}

exports.removeFolder = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  deleteFolders(condition, options, function(err, numRemoved) {
    callback(err, numRemoved);
  });
}

exports.populateParentFolder = function(folder, folders_map, callback) {
  if (!folder.parent) return callback();
  if (folders_map[folder.parent]) {
    return callback(null, folders_map[folder.parent]);
  }
  exports.getFolder({_id: folder.parent}, function(err, parent_folder) {
    if (err) return callback(err);
    if (!parent_folder) return callback();

    folder._parent = parent_folder;

    if (!folders_map[parent_folder._id]) {
      folders_map[parent_folder._id] = parent_folder;
    }
    // if (parent_folder.parent) {
    //   exports.populateParentFolder(parent_folder, folders_map, callback);
    // } else {
      callback();
    // }
  });
}

exports.populateFolders = function(folders, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var folders_map = {};
  async.eachSeries(folders, function(folder, cb) {
    exports.populateParentFolder(folder, folders_map, function(err) {
      if (err) cb();
      cb();
    });
  }, function(err) {
    callback(err, folders);
  });
}

exports.updatePhotoFolderOnPhotoAdded = function(folder_id, photo, cb) {
  if (!folder_id || !photo) return cb();

  exports.getFolder({_id: folder_id}, function(err, folder) {
    if (err) return cb(err);
    if (!folder) return cb();

    var update = {};
    update.photos_count = (folder.photos_count || 0) + 1;
    if (photo.size) {
      update.size = (folder.size || 0) + photo.size;
    }
    if (!folder.first_created || folder.first_created > photo.created) {
      update.first_created = photo.created;
    }
    if (!folder.last_created || folder.last_created < photo.created) {
      update.last_created = photo.created;
    }
    if (photo.thumb && folder.cover != photo.thumb) {
      update.cover = photo.thumb;
    } else if (!folder.cover) {
      update.cover = photo.md5;// + path.extname(photo.name);
    }
    exports.updateFolder({_id: folder._id}, update, cb);
  });
}

exports.updatePhotoFolderOnPhotoRemoved = function(folder_id, photo, cb) {
  if (!folder_id || !photo) return cb();

  exports.getFolder({_id: folder_id}, function(err, folder) {
    if (err) return cb(err);
    if (!folder) return cb();

    var update = {};
    update.photos_count = (folder.photos_count > 0) ? (folder.photos_count-1) : 0;
    if (photo.size) {
      update.size = (folder.size > photo.size) ? (folder.size - photo.size) : 0;
    }
    // TODO: update first created
    // TODO: update last created
    // TODO: update cover
    exports.updateFolder({_id: folder._id}, update, cb);
  });
}

var calculatePhotoFolderSize = function(folder_id, cb) {
  if (typeof db.getPhotosSize == 'function') {
    db.getPhotosSize({folder: folder_id}, function(err, folder_size) {
      if (err) return cb(err);
      cb(null, folder_size);
    });
  } else {
    db.getAllPhotos({folder: folder_id}, {size: 1}, function(err, photos) {
      if (err) return cb(err);
      if (!photos) return cb(null, 0);
      var folder_size = 0;
      photos.forEach(function(photo) {
        folder_size+=photo.size;
      });
      cb(null, folder_size);
    });
  }
}

var updatePhotoFolder = function(folder_id, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  if (!folder_id) return callback();

  exports.getFolder({_id: folder_id}, function(err, folder) {
    if (err) return callback(err);
    if (!folder) {
      console.log('DB:', 'Folder doesn\'t exist:', folder_id);
      return callback();
    }
    
    var update = {};
    var should_update = false;

    var checkFolderPhotosCount = function(cb) {
      // update photos_count
      db.getPhotoCount({folder: folder._id}, function(err, count) {
        if (err) return cb(err);
        if (count != folder.photos_count) {
          update.photos_count = count;
          should_update = true;
        }
        cb();
      });
    }

    var checkFolderSize = function(cb) {
      if (!options.update_folder_size) return cb();
      // update folder size
      calculatePhotoFolderSize(folder._id, function(err, folder_size) {
        if (err) return cb(err);
        if (folder_size != folder.size) {
          update.size = folder_size;
          should_update = true;
        }
        cb();
      });
    }

    var checkFolderTags = function(cb) {
      // update folder tags (get tags from folder name)
      var tags = utils.extractCapitalizedWords(folder.name);
      if (tags.length && !utils.compareTwoArrayOfStrings(tags, folder.tags)) {
        update.tags = tags;
        should_update = true;
      }
      cb();
    }

    var checkFolderPhotosLastCreated = function(cb) {
      // update last_created
      db.getPhotos({folder: folder._id}, {
        limit: 1, sort: {created: -1}, no_populate_photos: true
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (folder.last_created && folder.last_created != 0) {
            update.last_created = 0;
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (!folder.last_created || folder.last_created < photo0.created) {
            update.last_created = photo0.created;
            should_update = true;
          }
        }
        cb();
      });
    }

    var checkFolderPhotosFirstCreated = function(cb) {
      // update first_created
      db.getPhotos({folder: folder._id}, {
        limit: 1, sort: {created: 1}, no_populate_photos: true
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (folder.first_created && folder.first_created != 0) {
            update.first_created = 0;
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (!folder.first_created || folder.first_created > photo0.created) {
            update.first_created = photo0.created;
            should_update = true;
          }
        }
        cb();
      });
    }

    var checkFolderCover = function(cb) {
      // update cover
      db.getPhotos({folder: folder._id}, {
        limit: 1, sort: {added_at: -1}, no_populate_photos: true
      }, function(err, photos) {
        if (err) return cb(err);
        if (photos.length == 0) {
          if (folder.cover && folder.cover != "") {
            update.cover = "";
            should_update = true;
          }
        } else {
          var photo0 = photos[0];
          if (photo0.thumb && folder.cover != photo0.thumb) {
            update.cover = photo0.thumb;
            should_update = true;
          } else if (!folder.cover || (folder.cover != photo0.thumb && folder.cover != photo0.md5)) {
            update.cover = photo0.md5;// + path.extname(photo0.name);
            should_update = true;
          }
        }
        cb();
      });
    }

    async.series([
      checkFolderPhotosCount,
      checkFolderSize,
      checkFolderPhotosLastCreated,
      checkFolderPhotosFirstCreated,
      checkFolderCover,
      checkFolderTags,
    ], function(err) {
      if (err) return callback(err);
      if (should_update) {
        console.log('DB:', 'Update folder:', options.count + '/' + options.total, folder._id, folder.name);
        // console.log(update);
        exports.updateFolder({_id: folder._id}, update, callback);
      } else {
        callback();
      }
    });
  })
}

exports.updatePhotoFolder = updatePhotoFolder;

exports.updatePhotoFolders = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var condition = options.condition || {};
  getFolders(condition, {no_limit: true, projection: {_id: 1}}, function(err, folders) {
    if (err) callback();
    var total = folders.length;
    var count = 0;
    if (total>0) console.log('DB:','Update folders...', total);
    async.eachSeries(folders, function(folder, cb) {
      count++;
      updatePhotoFolder(folder._id, {
        total: total, 
        count: count, 
        update_folder_size: options.update_folder_size
      }, function(err) {
        setTimeout(cb, 0);
      });
    }, function(err) {
      if (total>0) console.log('DB:','Update folders... Done.');
      callback(err);
    });
  });
}
