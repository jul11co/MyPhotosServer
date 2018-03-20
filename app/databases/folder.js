// databases/folder.js

var path = require('path');
var async = require('async');

var Datastore = require('nedb');

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
  folderdb = new Datastore({
    filename: config.getDatabasePath('folders.db'),
    autoload: true
  });
  folderdb.ensureIndex({ fieldName: 'path', unique: true }, function (err) {
    if (err) console.log(err);
  });
}

exports.close = function() {
  folderdb = null;
}

exports.addFolder = function(folder_info, callback) {
  var folder = {};

  if (!!folder.path) {
    return callback(new Error('Missing folder path'));
  }
  folder.path = folder_info.path;
  folder.name = folder_info.name;
  if (folder_info.parent) folder.parent = folder_info.parent;
  if (folder_info.cover) folder.cover = folder_info.cover;

  var tags = utils.extractCapitalizedWords(folder_info.name);
  if (tags.length) folder.tags = tags;

  console.log('DB:', 'New folder:', folder.path);
  folder.added_at = new Date();
  folderdb.insert(folder, function(err, newFolder) {
    callback(err, newFolder);
  })
}

exports.getFolder = function(condition, callback) {
  folderdb.findOne(condition, function(err, folder) {
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
  
  var is_root = false;
  if (folder_abs_path == '/' || folder_abs_path == config.getPhotosDirectory()) {
    is_root = true;
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
        is_root: true
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
  folderdb.find(condition).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, folders) {
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
  folderdb.find({}).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, folders) {
    callback(err, folders);
  });
}

exports.getFolderCount = function(condition, callback) {
  if (typeof condition == 'function') {
    callback = condition;
    condition = {};
  }
  folderdb.count(condition, function(err, count) {
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
  folderdb.count(condition, function(err, count) {
    if (err) return callback(err);

    folderdb.find(condition)
      .sort(result_sort)
      .skip(result_skip).limit(result_limit).exec(function(err, folders) {
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
  folderdb.update(condition, update, options, function(err) {
    callback(err);
  });
}

exports.removeFolder = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  folderdb.remove(condition, options, function(err, numRemoved) {
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
    exports.updateFolder({_id: folder._id}, {$set: update}, cb);
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
    exports.updateFolder({_id: folder._id}, {$set: update}, cb);
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
        limit: 1, sort: {created: -1}
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
        limit: 1, sort: {created: 1}
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
        limit: 1, sort: {added_at: -1}
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
      // checkFolderSize,
      checkFolderPhotosLastCreated,
      checkFolderPhotosFirstCreated,
      checkFolderCover,
      checkFolderTags,
    ], function(err) {
      if (err) return callback(err);
      if (should_update) {
        console.log('DB:', 'Update folder:', folder._id, folder.name, options.count + '/' + options.total);
        exports.updateFolder({_id: folder._id}, {$set: update}, callback);
      } else {
        callback();
      }
    });
  })
}

exports.updatePhotoFolder = updatePhotoFolder;

exports.updatePhotoFolders = function(condition, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  var condition = options.condition || {};
  folderdb.find(condition, function(err, folders) {
    if (err) callback();
    var total = folders.length;
    var count = 0;
    if (total>0) console.log('Update folders...', total);
    async.eachSeries(folders, function(folder, cb) {
      count++;
      updatePhotoFolder(folder._id, {total: total, count: count}, function(err) {
        setTimeout(cb, 10);
      });
    }, function(err) {
      if (total>0) console.log('Update folders... Done.');
      callback(err);
    });
  });
}
