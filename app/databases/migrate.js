// databases/migrate.js

var path = require('path');
var async = require('async');

var NeDB = require('nedb');

var JobQueue = require('jul11co-jobqueue');

var config = require('../config');
var utils = require('../utils');
var db = require('../db');

var db_migrate_jobs = new JobQueue();
var db_migrating = false;

exports.addMigrateJob = function(options, handler, complete) {
  db_migrate_jobs.pushJob(options, handler, complete);
}

exports.check = function() {
  var photodb_file_exists = false;
  var folderdb_file_exists = false;
  if (utils.fileExistsSync(config.getDatabasePath('photos-sqlite.db'))) {
    photodb_file_exists = true;
  }
  if (utils.fileExistsSync(config.getDatabasePath('folders-sqlite.db'))) {
    folderdb_file_exists = true;
  }

  if (!photodb_file_exists && utils.fileExistsSync(config.getDatabasePath('photos.db'))
    && !folderdb_file_exists && utils.fileExistsSync(config.getDatabasePath('folders.db'))) {
    db_migrate_jobs.pushJob({}, migrateFromNeDB, function(err){});
  }
}

exports.isMigrating = function() {
  return db_migrating;
}

var migrateFromNeDB = function(args, done) {
  db_migrating = true;

  var photodb = new NeDB({ 
    filename: config.getDatabasePath('photos.db'),
    autoload: true
  });
  var folderdb = new NeDB({ 
    filename: config.getDatabasePath('folders.db'),
    autoload: true
  });

  var g_folder_map = {};

  var getFolderByPath = function(folder_path, folder_ref, callback) {
    if (typeof folder_ref == 'function') {
      callback = folder_ref;
      folder_ref = {};
    }

    var folder_path_is_absolute = path.isAbsolute(folder_path);
    var folder_abs_path = (folder_path_is_absolute) ? folder_path : config.getPhotosPath(folder_path);
    var folder_rel_path = (folder_path_is_absolute) ? config.getRelativePhotosPath(folder_path) : folder_path;
    
    var is_root = 0;
    if (folder_abs_path == '/' || folder_abs_path == config.getPhotosDirectory()) {
      is_root = 1;
    }
    if (is_root) folder_rel_path = '$ROOT';

    if (g_folder_map[folder_rel_path]) {
      return callback(null, g_folder_map[folder_rel_path]);
    }

    // console.log('DB:', 'getFolderByPath:', folder_rel_path);

    db.getFolder({path: folder_rel_path}, function(err, folder) {
      if (err) return callback(err);
      
      if (folder) { // existing folder with specified path
        return callback(null, folder);
      } else if (is_root) { // ROOT
        var folder_info = {
          path: '$ROOT',
          name: path.basename(folder_path),
          is_root: 1
        };
        if (folder_ref._id) {
          if (folder_ref.cover) folder_info.cover = folder_ref.cover;
          if (folder_ref.photos_count) folder_info.photos_count = folder_ref.photos_count;
          if (folder_ref.size) folder_info.size = folder_ref.size;
          if (folder_ref.first_created) folder_info.first_created = folder_ref.first_created;
          if (folder_ref.last_created) folder_info.last_created = folder_ref.last_created;
          if (folder_ref.tags) folder_info.tags = folder_ref.tags;
          if (folder_ref.added_at) folder_info.added_at = folder_ref.added_at;
        }
        // add ROOT folder
        db.insertFolder(folder_info, function(err, newfolder) {
          if (!err && newfolder) {
            console.log('DB:', 'New folder:', newfolder._id, newfolder.path);
            g_folder_map[folder_rel_path] = newfolder;
          }
          return callback(err, newfolder);
        });
      } else {
        var parent_path = path.dirname(folder_path);
        // get parent folder
        getFolderByPath(parent_path, function(err, parent_folder) {
          if (err) return callback(err);
          if (parent_folder) {
            var folder_info = { 
              path: folder_rel_path,
              name: path.basename(folder_path),
              parent: parent_folder._id
            };
            if (folder_ref._id) {
              if (folder_ref.cover) folder_info.cover = folder_ref.cover;
              if (folder_ref.photos_count) folder_info.photos_count = folder_ref.photos_count;
              if (folder_ref.size) folder_info.size = folder_ref.size;
              if (folder_ref.first_created) folder_info.first_created = folder_ref.first_created;
              if (folder_ref.last_created) folder_info.last_created = folder_ref.last_created;
              if (folder_ref.tags) folder_info.tags = folder_ref.tags;
              if (folder_ref.added_at) folder_info.added_at = folder_ref.added_at;
            }
            // add new folder
            db.insertFolder(folder_info, function(err, newfolder) {
              if (!err && newfolder) {
                console.log('DB:', 'New folder:', newfolder._id, newfolder.path);
                g_folder_map[folder_rel_path] = newfolder;
              }
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

  var getFolderOfPhoto = function(photo, folders_map, callback) {
    if (!photo.folder) return callback();
    if (folders_map[photo.folder]) {
      return callback(null, folders_map[photo.folder]);
    }
    folderdb.findOne({_id: photo.folder}, function(err, folder) {
      if (err) return callback(err);
      if (!folder) {
        console.log('Folder not found! ' + photo.folder);
        return callback();
      }

      // console.log('Folder: ' + folder._id + ', ' + folder.path);

      if (folder.is_root || folder.path == '$ROOT') {
        folder.path = config.getPhotosDirectory() || path.resolve('/');
      } else if (!path.isAbsolute(folder.path)) { // folder with relative path
        folder.path = config.getPhotosPath(folder.path);
      }

      getFolderByPath(folder.path, folder, function(err, m_folder) {
        if (err) return callback(err);
        if (!m_folder) {
          console.log('Folder not found! ' + folder.path);
          return callback();
        }

        if (m_folder && !folders_map[folder._id]) {
          folders_map[folder._id] = m_folder;
        }

        callback(null, m_folder);
      });
    });
  }

  var folders_map = {};

  photodb.count({}, function(err, count) {
    if (err) {
      console.log(err);
      db_migrating = false;
      return done(err);
    }
    console.log('Migrate photos from NeDB...', count);
    photodb.find({}, function(err, photos) {
      if (err) {
        console.log(err);
        db_migrating = false;
        return done(err);
      }
      if (!photos || photos.length == 0) {
        db_migrating = false;
        return done();
      }
      var total = photos.length;
      var count = 0;
      async.eachSeries(photos, function(photo, cb) {
        count++;
        console.log('Photo:', count+'/'+total, photo.name);
        getFolderOfPhoto(photo, folders_map, function(err, folder) {
          if (err) return cb(err);
          if (!folder || !folder._id) {
            return cb(new Error('Folder not found for photo! ' + photo._id + ', ' + photo.folder));
          }
          db.insertPhoto({
            folder: folder._id,
            name: photo.name,
            path: photo.path,
            src: photo.src,
            md5: photo.md5,
            size: photo.size,
            type: photo.type,
            thumb: photo.thumb,
            w: photo.w, h: photo.h, d: photo.d,
            collections: photo.collections || [],
            tags: photo.tags || [],
            created: photo.created,
            added_at: photo.added_at
          }, cb);
        })
      }, function(err) {
        db_migrating = false;
        if (err) console.log(err);
        else {
          console.log('Migrate photos from NeDB... Done');
          setTimeout(function() {
            db.updateDatabases({update_folder_size: true});
          },1000);
        }
        return done(err);
      });
    });
  });
}

