// routes/folders.js

var path = require('path');

var async = require('async');
var moment = require('moment');

var config = require('../config');
var db = require('../db');
var utils = require('../utils');

var getSubFoldersCount = function(folders, callback) {
  async.eachSeries(folders, function(folder, cb) {
    // get sub-folders count
    db.getFolderCount({parent: folder._id}, function(err, subfolders_count) {
      if (err) return cb(err);
      folder.folders_count = subfolders_count;
      cb();
    });
  }, function(err) {
    callback(err);
  });
}

// GET /folders
// GET /folders?skip=...&limit=...
exports.getFolders = function(req, res, next) {
  var options = {};

  if (req.query.skip) {
    options.skip = parseInt(req.query.skip);
  }
  if (req.query.limit) {
    options.limit = parseInt(req.query.limit);
  } else {
    options.limit = 30;
  }

  if (req.query.sort_by) {
    options.sort = {};
    if (req.query.sort_order == 'asc') {
      options.sort[req.query.sort_by] = 1;
    } else {
      options.sort[req.query.sort_by] = -1;
    }
  } else if (typeof req.query.sort != 'undefined') {
    options.sort = {};
    if (req.query.sort[0] == '-') {
      var sort = req.query.sort.substring(1);
      options.sort[sort] = -1;
    } else {
      options.sort[req.query.sort] = 1;
    }
  }

  var condition = {};
  // console.log(options);

  if (req.query.has_photos) {
    condition['photos_count'] = {$gte: 1};
  }

  db.getFolderCount(condition, function(err, count) {
    if (err) return next(err);

    // console.log('Total folders:', count);

    db.getFolders(condition, options, function(err, folders) {
      if (err) return next(err);

      // console.log('Found folders:', folders.length);

      config.fixFolderPaths(folders);
      // config.fixFolderCoverPaths(folders);

      folders.forEach(function(folder) {
        if (folder.path && !folder.name) folder.name = path.basename(folder.path);
        if (utils.folderExistsSync(folder.path)) folder.available = true;
      });

      getSubFoldersCount(folders, function(err) {
        // ignore errors
        res.json({
          query: req.query,
          total: count,
          skip: options.skip,
          limit: options.limit,
          folders: folders
        });
      });
    });
  });
}

exports.getFoldersCount = function(req, res, next) {
  db.getFolderCount({}, function(err, count) {
    if (err) return next(err);
    res.json({count: count});
  });
}

// POST /folders
// req.body
// {
//   name: String,
//   description: String,
//   tags: [String],
// }
exports.addFolder = function(req, res, next) {
  db.addFolder(req.body, function(err, newMag) {
    if (err) return next(err);
    res.json(newMag);
  });
}

// GET /folders/search?q=...
exports.searchFolders = function(req, res, next) {
  if (typeof req.query.q == 'undefined' || req.query.q == '') {
    return next(new Error('Missing query'));
  }

  var condition = {};
  var options = {};

  if (req.query.q[0] == '#') {
    // search by tag
    req.query.q = req.query.q.slice(1);
    options.search_query = req.query.q;
    options.search_field = 'tags';
    condition = utils.buildSearchCondition(req.query, 'tags');
  } else {
    options.search_query = req.query.q;
    options.search_field = 'name';
    condition = utils.buildSearchCondition(req.query, 'name');
  }

  if (req.query.skip) {
    options.skip = parseInt(req.query.skip);
  }
  if (req.query.limit) {
    options.limit = parseInt(req.query.limit);
  } else {
    options.limit = 30;
  }
  if (req.query.sort_by) {
    options.sort = {};
    if (req.query.sort_order == 'asc') {
      options.sort[req.query.sort_by] = 1;
    } else {
      options.sort[req.query.sort_by] = -1;
    }
  } else if (typeof req.query.sort != 'undefined') {
    options.sort = {};
    if (req.query.sort[0] == '-') {
      var sort = req.query.sort.substring(1);
      options.sort[sort] = -1;
    } else {
      options.sort[req.query.sort] = 1;
    }
  } else {
    options.sort = {added_at: -1};
  }

  if (req.query.has_photos) {
    condition['photos_count'] = {$gte: 1};
  }

  // console.log(condition, options);

  db.findFolders(condition, options, function(err, result) {
    if (err) return next(err);

    // console.log('Found:', result.count);

    config.fixFolderPaths(result.folders);
    // config.fixFolderCoverPaths(result.folders);

    result.folders.forEach(function(folder) {
      if (folder.path && !folder.name) folder.name = path.basename(folder.path);
      if (utils.folderExistsSync(folder.path)) folder.available = true;
    });

    // res.json({
    //   total: result.count,
    //   skip: options.skip,
    //   limit: result.limit,
    //   folders: result.folders
    // });

    getSubFoldersCount(result.folders, function(err) {
      // ignore errors
      res.json({
        query: req.query,
        total: result.count,
        skip: result.skip,
        limit: result.limit,
        folders: result.folders
      });
    });
  });
}

// GET /folders/:folder_id
// GET /folders/:folder_id?with_subfolders=1
// GET /folders/:folder_id?with_photos=1[&skip=...][&limit=...][&sort=...][&before=...][&after=...]
exports.getFolder = function(req, res, next) {
  
  var getFolderPhotos = function(folder, cb) {
    var options = {};

    if (req.query.skip) {
      options.skip = parseInt(req.query.skip);
    }
    if (req.query.limit) {
      options.limit = parseInt(req.query.limit);
    } else {
      options.limit = 30;
    }
    if (req.query.sort_by) {
      options.sort = {};
      if (req.query.sort_order == 'asc') {
        options.sort[req.query.sort_by] = 1;
      } else {
        options.sort[req.query.sort_by] = -1;
      }
    } else if (typeof req.query.sort != 'undefined') {
      options.sort = {};
      if (req.query.sort[0] == '-') {
        var sort = req.query.sort.substring(1);
        options.sort[sort] = -1;
      } else {
        options.sort[req.query.sort] = 1;
      }
    } else {
      options.sort = {created: -1};
    }

    var condition = {
      folder: req.params.folder_id
    };

    if (req.query.after || req.query.before) {
      var time_filter = {};
      if (req.query.after) {
        var time_after = parseInt(req.query.after);
        if (!isNaN(time_after)) {
          time_filter.$gt = moment(new Date(time_after)).toDate().getTime();
        }
      }
      if (req.query.before) {
        var time_before = parseInt(req.query.before);
        if (!isNaN(time_before)) {
          time_filter.$lt = moment(new Date(time_before)).toDate().getTime();
        }
      }
      if (req.query.sort == '-added_at') {
        condition.added_at = time_filter;
      } else { // created
        condition.created = time_filter;
      }
    }

    // console.log(condition);
    // console.log(options);

    options.populate_collections = true;

    db.getPhotos(condition, options, function(err, photos) {
      if (err) return cb(err);

      config.fixPhotoPaths(photos);

      if (!folder.photos_count) {
        db.getPhotoCount({folder: folder._id}, function(err, count) {
          if (err) return cb(err);

          folder.photos_count = count;

          cb(null, {
            total: folder.photos_count,
            skip: options.skip,
            limit: options.limit,
            photos: photos
          });
        });
      } else {
        cb(null, {
          total: folder.photos_count,
          skip: options.skip,
          limit: options.limit,
          photos: photos
        });
      }
    });
  }

  var getSubFolders = function(parent, cb) {
    var options = {};

    if (req.query.skip) {
      options.skip = parseInt(req.query.skip);
    }
    if (req.query.limit) {
      options.limit = parseInt(req.query.limit);
    } else {
      options.limit = 30;
    }

    if (req.query.sort_by) {
      options.sort = {};
      if (req.query.sort_by == 'created') {
        options.sort['first_created'] = (req.query.sort_order == 'asc') ? 1 : -1;
      } else if (req.query.sort_order == 'asc') {
        options.sort[req.query.sort_by] = 1;
      } else {
        options.sort[req.query.sort_by] = -1;
      }
    } else if (typeof req.query.sort != 'undefined') {
      options.sort = {};
      if (req.query.sort[0] == '-') {
        var sort = req.query.sort.substring(1);
        options.sort[sort] = -1;
      } else {
        options.sort[req.query.sort] = 1;
      }
    }

    var condition = {parent: parent._id};
    // console.log(condition);
    // console.log(options);

    db.getFolderCount(condition, function(err, count) {
      if (err) return cb(err);

      // console.log('Total folders:', count);

      db.getFolders(condition, options, function(err, folders) {
        if (err) return cb(err);

        // console.log('Found folders:', folders.length);

        config.fixFolderPaths(folders);
        // config.fixFolderCoverPaths(folders);

        folders.forEach(function(folder) {
          if (folder.path && !folder.name) folder.name = path.basename(folder.path);
          if (utils.folderExistsSync(folder.path)) folder.available = true;
        });

        getSubFoldersCount(folders, function(err) {
          // ignore errors
          cb(null, {
            total: count,
            skip: options.skip,
            limit: options.limit,
            folders: folders
          });
        });
      });
    });
  }

  var response = function(folder) {
    var resp = {
      query: req.query,
      folder: folder
    };
    async.parallel([
      function(cb) {
        if (folder.parent) {
          // get sub-folders
          db.getFolder({_id: folder.parent}, function(err, parent) {
            if (err) return cb(err);
            if (parent) folder._parent = parent;
            cb();
          });
        } else {
          cb();
        }
      },
      function(cb) {
        if (req.query.with_subfolders == '1') {
          // get sub-folders
          getSubFolders(folder, function(err, result) {
            if (err) return cb(err);
            if (result && result.folders) {
              resp.folders = result.folders;
              resp.folders_count = result.total;
              resp.folders_skip = result.skip;
              resp.folders_limit = result.limit;
            }
            cb();
          });
        } else {
          cb();
        }
      },
      function(cb) {
        if (req.query.with_photos == '1') {
          getFolderPhotos(folder, function(err, result) {
            if (err) return cb(err);
            if (result && result.photos) {
              resp.photos = result.photos;
              resp.photos_count = result.total;
              resp.photos_skip = result.skip;
              resp.photos_limit = result.limit;
            }
            cb();
          });
        } else {
          cb();
        }
      }
    ], function(err) {
      if (err) return next(err);
      res.json(resp);
    });
  }

  // console.log('Get folder:', req.params.folder_id);
  // console.log(req.query);

  if (req.params.folder_id == 'ROOT') {
    db.getFolder({is_root: 1}, function(err, folder) {
      if (err) return next(err);
      if (!folder) {
        return next(new Error('The folder is not available'));
      }

      config.fixFolderPath(folder);
      // config.fixFolderCoverPaths([folder]);

      // console.log(folder);

      response(folder);
    });
  } else {
    db.getFolder({_id: req.params.folder_id}, function(err, folder) {
      if (err) return next(err);
      if (!folder) {
        return next(new Error('The folder is not available'));
      }

      config.fixFolderPath(folder);
      // config.fixFolderCoverPaths([folder]);

      // console.log(folder);

      response(folder);
    });
  }
}

// PUT /folders/:folder_id
exports.updateFolder = function(req, res, next) {
  req.body._id = req.params.folder_id;
  console.log('Update folder:', req.params.folder_id, req.body);
  db.updateFolder({_id: req.params.folder_id}, req.body, function(err) {
    if (err) {
      console.log(err);
      return next(err);
    }
    res.json({success: true});
  });
}

// GET /folders/:folder_id/delete
// GET /folders/:folder_id/delete?with_photos=1
exports.deleteFolder = function(req, res, next) {
  db.getFolder({_id: req.params.folder_id}, function(err, folder) {
    if (err) return next(err);
    if (!folder) {
      return next(new Error('The folder is not available'));
    }

    if (req.query.with_photos == '1') {
      // remove related folder photos
      db.removePhoto({folder: req.params.folder_id}, {multi: true}, function(err, numRemoved) {
        if (err) return next(err);

        var photosRemoved = numRemoved;

        // remove itself
        db.removeFolder({_id: req.params.folder_id}, function(err, numRemoved) {
          if (err) return next(err);

          res.json({
            success: true,
            photosRemoved: photosRemoved,
            message: 'Folder: "' + folder.name + '" has been deleted (with ' + photosRemoved + ' photos removed)'
          });
        });
      });
    } else {
      db.removeFolder({_id: req.params.folder_id}, function(err, numRemoved) {
        if (err) return next(err);

        res.json({
          success: true,
          photosRemoved: 0,
          message: 'Folder: "' + folder.name + '" has been deleted (with ' + 0 + ' photos removed)'
        });
      });
    }
  });
}
