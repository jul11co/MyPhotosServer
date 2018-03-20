// app/db.js

var path = require('path');
var async = require('async');

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var JobQueue = require('jul11co-jobqueue');

var config = require('./config');
var utils = require('./utils');

/* Databases */

// var PhotoDB = require('./databases/photo');
var PhotoDB = require('./databases/photo-sqlite');
// var FolderDB = require('./databases/folder');
var FolderDB = require('./databases/folder-sqlite');
var CollectionDB = require('./databases/collection');
var FavoriteDB = require('./databases/favorite');

var StatsDB = require('./databases/stats');
var Migrate = require('./databases/migrate');

var db_updating = false;

exports.isBusy = function() {
  return db_updating || Migrate.isMigrating() || PhotoDB.isBusy() || FolderDB.isBusy() || CollectionDB.isBusy();
}

var loadDatabases = function() {
  Migrate.check();
  PhotoDB.load();
  FolderDB.load();
  CollectionDB.load();
  FavoriteDB.load();
  StatsDB.load();
}

var closeDatabases = function() {
  PhotoDB.close();
  FolderDB.close();
  CollectionDB.close();
  FavoriteDB.close();
  StatsDB.close();
}

var reloadDatabases = function() { // caused by data path changed
  closeDatabases();
  loadDatabases();
}

var updateDatabases = function(opts) {
  if (db_updating || Migrate.isMigrating() || PhotoDB.isBusy() || FolderDB.isBusy() || CollectionDB.isBusy()) return;
  db_updating = true;
  opts = opts || {};
  async.series([
    function(cb) { FolderDB.updatePhotoFolders(opts, cb); },
    function(cb) { CollectionDB.updatePhotoCollections(opts, cb); }
  ], function(err) {
    db_updating = false;
    if (err) {
      console.log('DB:', 'Update DB failed.');
      console.log('');
    }
  });
}

exports.loadDatabases = loadDatabases;
exports.closeDatabases = closeDatabases;
exports.reloadDatabases = reloadDatabases;
exports.updateDatabases = updateDatabases;

// load databases on init
loadDatabases();

// setInterval(updateDatabases, 10*60*1000); // 10 minutes
// setTimeout(updateDatabases, 20000); // 20 seconds

/* Database Change Listener */

var DBChangeListener = function(options) {
  EventEmitter.call(this);
}

util.inherits(DBChangeListener, EventEmitter);

var db_listener = new DBChangeListener();
var db_listener_jobs = new JobQueue();

db_listener.on('folder-added', function(folder) {
  // console.log('DB Trigger: folder-added');
});
db_listener.on('folder-removed', function(folder) {
  // console.log('DB Trigger: folder-removed');
});
db_listener.on('collection-added', function(collection) {
  // console.log('DB Trigger: collection-added');
});
db_listener.on('collection-removed', function(collection) {
  // console.log('DB Trigger: collection-removed');
});
db_listener.on('photo-added', function(photo) {
  // console.log('DB Trigger: photo-added');
  db_listener_jobs.pushJob(photo, function(photo, done) {
    async.series([
      // function(cb) { FolderDB.updatePhotoFolder(photo.folder, cb); },
      // function(cb) { CollectionDB.updateCollections(photo.collections, cb); },
      function(cb) { FolderDB.updatePhotoFolderOnPhotoAdded(photo.folder, photo, cb); },
      function(cb) { StatsDB.updatePhotoDateStats(photo, cb); },  
      function(cb) { StatsDB.updatePhotoTagStats(photo, cb); },
    ], function(err) {
      if (err) console.log('DB:', err.message);
      done();
    });
  }, function(){});
});
db_listener.on('photo-removed', function(photo) {
  // console.log('DB Trigger: photo-removed');
  db_listener_jobs.pushJob(photo, function(photo, done) {
    async.series([
      // function(cb) { FolderDB.updatePhotoFolder(photo.folder, cb); },
      // function(cb) { CollectionDB.updateCollections(photo.collections, cb); },
      function(cb) { FolderDB.updatePhotoFolderOnPhotoRemoved(photo.folder, photo, cb); },
      function(cb) { StatsDB.updatePhotoDateStats(photo, true, cb); },
      function(cb) { StatsDB.updatePhotoTagStats(photo, true, cb); },
    ], function(err) {
      if (err) console.log('DB:', err.message);
      done();
    });
  }, function(){});
});
db_listener.on('photos-removed', function(photos) {
  // console.log('DB Trigger: photos-removed');
  db_listener_jobs.pushJob(photos, function(photos, done) {
    async.eachSeries(photos, function(photo, cb) {
      async.series([
        // function(cb2) { FolderDB.updatePhotoFolder(photo.folder, cb2); },
        // function(cb2) { CollectionDB.updateCollections(photo.collections, cb2); },
        function(cb2) { FolderDB.updatePhotoFolderOnPhotoRemoved(photo.folder, photo, cb2);},
        function(cb2) { StatsDB.updatePhotoDateStats(photo, true, cb2); },
        function(cb2) { StatsDB.updatePhotoTagStats(photo, true, cb2); },
      ], function(err) {
        if (err) console.log('DB:', err.message);
        cb();
      });
    }, function(err) {
      if (err) console.log('DB:', err.message);
      done();
    });
  }, function(){});
});

exports.triggerDBListener = function(event, data) {
  db_listener.emit(event, data);
}

/* Settings */

exports.getSettings = function(options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  config.getSettings(options, function(err, settings) {
    callback(err, settings);
  });
}

exports.saveSettings = function(settings, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  config.saveSettings(settings, options, function(err, result) {
    if (err) return callback(err);
    if (result && result.dataDirectoryChanged) {
      reloadDatabases();
    }
    callback(null, result);
  });
}

/* Photos */

exports.insertPhoto = PhotoDB.insertPhoto;
exports.addPhoto = PhotoDB.addPhoto;
exports.getPhoto = PhotoDB.getPhoto;
exports.getRecentAddedPhotos = PhotoDB.getRecentAddedPhotos;
exports.getRecentCreatedPhotos = PhotoDB.getRecentCreatedPhotos;
exports.getAllPhotos = PhotoDB.getAllPhotos;
exports.getPhotoCount = PhotoDB.getPhotoCount;
exports.getPhotosCount = PhotoDB.getPhotoCount;
exports.getPhotosSize = PhotoDB.getPhotosSize;

exports.findPhotos = PhotoDB.findPhotos;
exports.populatePhotos = PhotoDB.populatePhotos;
exports.getPhotos = PhotoDB.getPhotos;
exports.updatePhoto = PhotoDB.updatePhoto;
exports.updatePhotos = PhotoDB.updatePhotos;
exports.removePhoto = PhotoDB.removePhoto;

/* Folders */

exports.insertFolder = FolderDB.insertFolder;
exports.addFolder = FolderDB.addFolder;
exports.getFolder = FolderDB.getFolder;
exports.getFolderOfPhoto = FolderDB.getFolderOfPhoto;
exports.getFolderByPath = FolderDB.getFolderByPath;
exports.getFolders = FolderDB.getFolders;
exports.getRecentAddedFolders = FolderDB.getRecentAddedFolders;
exports.getFolderCount = FolderDB.getFolderCount;
exports.findFolders = FolderDB.findFolders;
exports.updateFolder = FolderDB.updateFolder;
exports.removeFolder = FolderDB.removeFolder;

exports.populateParentFolder = FolderDB.populateParentFolder;
exports.populateFolders = FolderDB.populateFolders;

exports.updatePhotoFolderOnPhotoAdded = FolderDB.updatePhotoFolderOnPhotoAdded;
exports.updatePhotoFolderOnPhotoRemoved = FolderDB.updatePhotoFolderOnPhotoRemoved;
exports.updatePhotoFolder = FolderDB.updatePhotoFolder;
exports.updatePhotoFolders = FolderDB.updatePhotoFolders;

/* Collections */

exports.addCollection = CollectionDB.addCollection;
exports.getCollection = CollectionDB.getCollection;
exports.getCollections = CollectionDB.getCollections;
exports.getCollectionsOfPhoto = CollectionDB.getCollectionsOfPhoto;
exports.getRecentAddedCollections = CollectionDB.getRecentAddedCollections;
exports.getCollectionCount = CollectionDB.getCollectionCount;
exports.findCollections = CollectionDB.findCollections;
exports.updateCollection = CollectionDB.updateCollection;

exports.updatePhotoCollection = CollectionDB.updatePhotoCollection;
exports.updatePhotoCollections = CollectionDB.updatePhotoCollections;
exports.updateCollections = CollectionDB.updateCollections;

/* Stats */

exports.updatePhotoTagStats = StatsDB.updatePhotoTagStats;
exports.getPhotoTagStats = StatsDB.getPhotoTagStats;

exports.updatePhotoDateStats = StatsDB.updatePhotoDateStats;
exports.getPhotoDateStats = StatsDB.getPhotoDateStats;

/* Favorites */

exports.isFavorited = FavoriteDB.isFavorited;
exports.addToFavorites = FavoriteDB.addToFavorites;
exports.removeFromFavorites = FavoriteDB.removeFromFavorites;
exports.getFavoriteEntry = FavoriteDB.getFavoriteEntry;
exports.getFavoritesCount = FavoriteDB.getFavoritesCount;
exports.getFavorites = FavoriteDB.getFavorites;
