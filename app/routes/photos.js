// routes/photos.js

var async = require('async');
var moment = require('moment');

var path = require('path');
var fse = require('fs-extra');

var config = require('../config');
var db = require('../db');
var utils = require('../utils');

// GET /photos
// GET /photos?skip=...&limit=...
// GET /photos?sort=... // (sort: 'created_date' or 'added_date' or 'name')
// GET /photos?after=...&before=...
// GET /photos?year=...
// GET /photos?year=...&month=...
// GET /photos?year=...&month=...&day=...
exports.getPhotos = function(req, res, next) {

  var options = {};
  var condition = {};

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

  if (req.query.after || req.query.before) {
    var time_filter = {};
    if (req.query.after) {
      var time_after = parseInt(req.query.after);
      if (!isNaN(time_after)) {
        time_filter.$gt = (new Date(time_after));
      }
    }
    if (req.query.before) {
      var time_before = parseInt(req.query.before);
      if (!isNaN(time_before)) {
        time_filter.$lt = (new Date(time_before));
      }
    }
    if (req.query.sort == '-added_at') {
      condition.added_at = time_filter;
    } else { // created
      condition.created = time_filter;
    }
  }
  else if (req.query.year && req.query.month && req.query.day) {
    var year = parseInt(req.query.year);
    var month = parseInt(req.query.month);
    var day = parseInt(req.query.day);
    condition.created = condition.created || {};
    var m = moment({year: year, month: month, day: day});
    condition.created = {
      $gte: m.startOf('day').toDate().toJSON(),
      $lte: m.endOf('day').toDate().toJSON()
    };
  }
  else if (req.query.year && req.query.month) {
    var year = parseInt(req.query.year);
    var month = parseInt(req.query.month);
    condition.created = condition.created || {};
    var m = moment({year: year, month: month, day: 1});
    condition.created = {
      $gte: m.startOf('month').toDate().toJSON(),
      $lte: m.endOf('month').toDate().toJSON()
    };
  }
  else if (req.query.year) {
    var year = parseInt(req.query.year);
    condition.created = condition.created || {};
    var m = moment({year: year, month: 0, day: 1});
    condition.created = {
      $gte: m.startOf('year').toDate().toJSON(),
      $lte: m.endOf('year').toDate().toJSON()
    };
  }

  // console.log(condition);

  db.findPhotos(condition, options, function(err, result) {
    if (err) return next(err);

    // console.log({total: result.count, count: result.photos.length});

    db.populatePhotos(result.photos, {
      populate_collections: true
    }, function(err, photos) {
      if (err) return next(err);
      
      config.fixPhotoPaths(photos);

      res.json({
        query: req.query,
        total: result.count,
        skip: options.skip,
        limit: options.limit,
        photos: photos
      });
    });
  });
}

// POST /photos
// req.body
// {
//   force_update: Boolean,      // OPTIONAL
//   photo: {
//      folder: String,          // OPTIONAL
//      path: String,            // REQUIRED (if not src)
//      src: String,             // REQUIRED (if not path)
//      name: String,            // REQUIRED
//      type: String,            // OPTIONAL
//      md5: String,             // REQUIRED
//      size: Number,            // REQUIRED, in bytes
//      thumb: String,           // OPTIONAL
//      w: Number,               // OPTIONAL
//      h: Number,               // OPTIONAL
//      d: Number,               // OPTIONAL
//      created: Date            // OPTIONAL
//      tags: [String],          // OPTIONAL
//      collection: String,      // OPTIONAL (if not multiple collections)
//      collections: String,     // OPTIONAL (if not single collection)
//   }
// }
exports.addPhoto = function(req, res, next) {
  if (!req.body.photo) {
    return res.status(401).json({
      error: 'Invalid request (missing photo)'
    });
  }

  var options = {};

  if (req.body.force_update) options.force_update = true;

  if (typeof req.body.photo == 'string') {
    try {
      req.body.photo = JSON.parse(req.body.photo);
      // console.log('SERVER:','addPhoto',req.body.photo.name);
    } catch(e) {
      return res.status(401).json({
        error: 'Invalid request (photo field malformed)'
      });
    }
  }

  if (!req.body.photo.md5) {
    return res.status(401).json({
      error: 'Invalid request (missing md5)'
    });
  }

  if (req.files && req.files.thumb_file && req.files.thumb_file.originalFilename) {
    var target_thumb_file = req.body.photo.md5 + path.extname(req.files.thumb_file.originalFilename);
    var target_thumb_path = config.getThumbnailPath(target_thumb_file);
    // console.log('Moving: ',req.files.thumb_file.path,'-->',target_thumb_path);

    fse.move(req.files.thumb_file.path, target_thumb_path, { overwrite: true }, function(err) {
      if (err) {
        if (err.code != 'EEXIST') console.log(err);
        // return next(err);
      }

      // req.body.photo.thumb = '/' + config.getRelativeDataPath(target_thumb_path);
      req.body.photo.thumb = target_thumb_file;

      db.addPhoto(req.body.photo, options, function(err, photo) {
        if (err) {
          console.log(err);
          return next(err);
        }
        res.json(photo);
      });
    });
  } else {
    // return res.status(401).json({
    //   error: 'Invalid request (missing thumb file)'
    // });
    db.addPhoto(req.body.photo, options, function(err, photo) {
      if (err) {
        console.log(err);
        return next(err);
      }
      res.json(photo);
    });
  }
}

// GET /photos/:photo_id
// GET /photos/:photo_id?with_folder=1
// GET /photos/:photo_id?with_collection=1
exports.getPhoto = function(req, res, next) {
  db.getPhoto({_id: req.params.photo_id}, function(err, photo) {
    if (err) return next(err);
    if (!photo) {
      return next(new Error('The photo is not available'));
    }
    
    async.parallel([
      function(cb) {
        if (req.query.with_folder == '1' && photo.folder) {
          db.getFolderOfPhoto(photo, {}, function(err, folder) {
            if (err) return cb(err);
            if (folder) photo._folder = folder;
            cb();
          });
        } else {
          cb();
        }
      },
      function(cb) {
        if (req.query.with_collections == '1' && photo.collections && photo.collections.length) {
          db.getCollectionsOfPhoto(photo, {}, function(err, collections) {
            if (err) return cb(err);
            if (collections) photo._collections = collections;
            cb();
          });
        } else {
          cb();
        }
      }
    ], function(err) {
      if (err) return next(err);

      config.fixPhotoPaths([photo]);

      res.json({
        query: req.query,
        photo: photo
      });
    });
  });
}

// DELETE /photos/:photo_id
// DELETE /photos/:photo_id?remove_from_disk=true
exports.deletePhoto = function(req, res, next) {
  db.getPhoto({_id: req.params.photo_id}, function(err, photo) {
    if (err) return next(err);
    if (!photo) {
      return next(new Error('The photo is not available'));
    }

    var removeFromDatabase = function(cb) {
      db.removePhoto({_id: req.params.photo_id}, function(err) {
        if (err) return cb(err);
        cb();
      });
    }

    var removeFromDisk = function(cb) {
      utils.removeFile(photo.path, function(err) {
        if (err) return cb(err);
        cb();
      });
    }

    db.populatePhotos([photo], function(err) {
      if (err) return next(err);

      config.fixPhotoPaths([photo]);

      if (req.query.remove_from_disk) {
        removeFromDisk(function(err) {
          if (err) {
            return res.json({
              error: 'Photo: "' + photo.name + '" can\'t be deleted from disk'
            });
          }
          removeFromDatabase(function(err) {
            if (err) return next(err);
            res.json({
              success: true,
              message: 'Photo: "' + photo.name + '" has been deleted from disk and database'
            });
          });
        });
      } else {
        removeFromDatabase(function(err) {
          if (err) return next(err);
          res.json({
            success: true,
            message: 'Photo: "' + photo.name + '" has been deleted from database'
          });
        });
      }
    });
  });
}

// GET /photos/search?q=...
exports.searchPhotos = function(req, res, next) {
  if (typeof req.query.q == 'undefined' || req.query.q == '') {
    return next(new Error('Missing query'));
  }

  var condition = utils.buildSearchCondition(req.query);

  var options = {};

  options.search_query = req.query.q;

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

  db.findPhotos(condition, options, function(err, result) {
    if (err) return callback(err);

    db.populatePhotos(result.photos, {
      populate_folders: true,
      populate_collections: true
    }, function(err, photos) {
      if (err) console.log(err);

      config.fixPhotoPaths(photos);

      res.json({
        total: result.count,
        skip: options.skip,
        limit: result.limit,
        photos: photos
      });
    });
  });
}

exports.getPhotosCount = function(req, res, next) {
  db.getPhotoCount({}, function(err, count) {
    if (err) return next(err);
    res.json({count: count});
  });
}
