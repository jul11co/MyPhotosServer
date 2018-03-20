// app/config.js

var path = require('path');
var fse = require('fs-extra');

var JsonStore = require('jul11co-jsonstore');
var utils = require('./utils');

JsonStore.prototype.close = function() {
  this.exit();
}

/////

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
exports.getUserHome = getUserHome;

var configDirectory = path.join(getUserHome(), '.jul11co', 'MyPhotosServer');
fse.ensureDirSync(configDirectory);

exports.getConfigDirectory = function() {
  return configDirectory;
}

// Settings

var settingsStore = new JsonStore({file: path.join(configDirectory, 'settings.json')});

var package = require(__dirname + '/../package.json');
if (!settingsStore.get('version') && package.version) {
  settingsStore.set('version', package.version);
}

var photosDirectory = null;
var settingsPhotosDirectory = settingsStore.get('photosDirectory');
if (settingsPhotosDirectory && settingsPhotosDirectory != photosDirectory) {
  photosDirectory = settingsPhotosDirectory;
  console.log('Photos directory:', photosDirectory);
}

var dataDirectory = configDirectory;
var settingsDataDirectory = settingsStore.get('dataDirectory');
if (settingsDataDirectory && settingsDataDirectory != dataDirectory) {
	dataDirectory = settingsDataDirectory;
	console.log('Data directory:', dataDirectory);
} else {
	settingsStore.update('dataDirectory', dataDirectory, true);
}

var defaultImportDirectory = settingsStore.get('importDirectory');
if (!defaultImportDirectory) {
	defaultImportDirectory = getUserHome();
	settingsStore.update('importDirectory', defaultImportDirectory, true);
}

var databasesDirectory = path.join(dataDirectory, 'databases');
var cacheDirectory = path.join(dataDirectory, 'cache');
var thumbnailsDirectory = path.join(dataDirectory, 'photo_thumbnails');

fse.ensureDirSync(dataDirectory);
fse.ensureDirSync(databasesDirectory);
fse.ensureDirSync(cacheDirectory);
fse.ensureDirSync(thumbnailsDirectory);

//====

exports.getPhotosDirectory = function() {
  return photosDirectory;
}

exports.setPhotosDirectory = function(photos_dir) {
  photosDirectory = photos_dir;
  console.log('Photos dir:', photosDirectory);
  settingsStore.update('photosDirectory', photosDirectory, true);
}

exports.getPhotosPath = function(photopath) {
  return photosDirectory ? path.join(photosDirectory, photopath) : photopath;
}

exports.getRelativePhotosPath = function(photopath) {
  return photosDirectory ? path.relative(photosDirectory, photopath) : photopath;
}

//====

exports.getDataDirectory = function() {
	return dataDirectory;
}

exports.setDataDirectory = function(data_dir, no_settings) {
	dataDirectory = data_dir;

  console.log('Data dir:', dataDirectory);
  fse.ensureDirSync(dataDirectory);

  settingsStore.close();
  settingsStore = new JsonStore({file: path.join(dataDirectory, 'settings.json')});
  
  if (!settingsStore.get('version') && package.version) {
    settingsStore.set('version', package.version);
  }
  if (!no_settings) {
    settingsStore.update('dataDirectory', dataDirectory, true);
  }
  
  defaultImportDirectory = settingsStore.get('importDirectory');
  if (!defaultImportDirectory) {
    defaultImportDirectory = getUserHome();
    settingsStore.update('importDirectory', defaultImportDirectory, true);
  }

  photosDirectory = settingsStore.get('photosDirectory');

	databasesDirectory = path.join(dataDirectory, 'databases');
	cacheDirectory = path.join(dataDirectory, 'cache');
	thumbnailsDirectory = path.join(dataDirectory, 'photo_thumbnails');

	fse.ensureDirSync(databasesDirectory);
	fse.ensureDirSync(cacheDirectory);
	fse.ensureDirSync(thumbnailsDirectory);
}

exports.getDataPath = function(datapath) {
	return path.join(dataDirectory, datapath);
}

exports.getRelativeDataPath = function(datapath) {
	return path.relative(dataDirectory, datapath);
}

//====

exports.getDatabasePath = function(datapath) {
	return path.join(databasesDirectory, datapath);
}

//====

exports.getCacheRoot = function() {
	return cacheDirectory;
}

exports.getCachePath = function(cachepath) {
	return path.join(cacheDirectory, cachepath);
}

//====

exports.getThumbnailsRoot = function() {
  return thumbnailsDirectory;
}

exports.getThumbnailRelPath = function(filename) {
	// var basename = path.basename(filename, path.extname(filename));
  var basename = path.basename(filename);
	if (basename.length >= 3) {
		return path.join(basename[0], basename[1], basename[2], filename);
	}
	return filename;
}

exports.getThumbnailPath = function(filename) {
  // var basename = path.basename(filename, path.extname(filename));
  var basename = path.basename(filename);
  if (basename.length >= 3) {
    return path.join(thumbnailsDirectory, basename[0], basename[1], basename[2], filename);
  }
  return path.join(thumbnailsDirectory, filename);
}

//====

exports.getSettings = function(options, callback) {
	callback(null, settingsStore.toMap());
}

exports.saveSettings = function(settings, options, callback) {
	var result = {};
	if (settings && settings.dataDirectory && settings.dataDirectory != dataDirectory) {
    console.log('Data directory has changed to:', settings.dataDirectory);
		result.dataDirectoryChanged = true;
		exports.setDataDirectory(settings.dataDirectory);		
	}
  if (settings && settings.photosDirectory && settings.photosDirectory != photosDirectory) {
    console.log('Photos directory has changed to:', settings.photosDirectory);
    result.photosDirectoryChanged = true;
    exports.setPhotosDirectory(settings.photosDirectory);   
  }
	if (settings && settings.importDirectory && settings.importDirectory != defaultImportDirectory) {
    console.log('Import directory has changed to:', settings.importDirectory);
		result.importDirectoryChanged = true;
		defaultImportDirectory = settings.importDirectory;
		settingsStore.update('importDirectory', defaultImportDirectory, true);
	}
	callback && callback(null, result);
}

//====

exports.fixPhotoPaths = function(photos) {        
  photos.forEach(function(photo) {
    if (photo._folder) { // photo has relative path
      if (!path.isAbsolute(photo._folder.path)) exports.fixFolderPath(photo._folder);
      photo.path = path.join(photo._folder.path, photo.name);
      if (!utils.folderExistsSync(photo._folder.path)) photo.unavailable = true;
    } else if (photo.path && path.isAbsolute(photo.path)) {
      if (!utils.fileExistsSync(photo.path)) photo.unavailable = true;
    }
    if (photo.thumb) {
      if (photo.thumb.indexOf('/photo_thumbnails/') == 0) {
        // photo.thumb = exports.getDataPath(photo.thumb);
        photo.thumb = path.basename(photo.thumb);
      } /*else {
        photo.thumb = exports.getThumbnailPath(photo.thumb);
      }*/
    } /*else {
      photo.thumb = exports.getThumbnailPath(photo.md5 + path.extname(photo.name));
    }*/
    if (photo._folder && photo._folder.cover) {
      if (photo._folder.cover.indexOf('/photo_thumbnails/') == 0) {
        // photo._folder.cover = exports.getDataPath(photo._folder.cover);
        photo._folder.cover = path.basename(photo._folder.cover);
      }/* else if (photo._folder.cover.indexOf('/') != 0) {
        photo._folder.cover = exports.getThumbnailPath(photo._folder.cover);
      }*/
    }
    if (photo._collections && photo._collections.length) {
      photo._collections.forEach(function(collection) {
        if (collection.cover) {
          if (collection.cover.indexOf('/photo_thumbnails/') == 0) {
            // collection.cover = exports.getDataPath(collection.cover);
            collection.cover = path.basename(collection.cover);
          }/* else if (collection.cover.indexOf('/') != 0) {
            collection.cover = exports.getThumbnailPath(collection.cover);
          }*/
        }
      });
    }
  });
}

exports.fixFolderPath = function(folder) {
  if (!folder) return;
  if (folder.is_root || folder.path == '$ROOT') {
    folder.path = photosDirectory || path.resolve('/');
  } else if (!path.isAbsolute(folder.path)) { // folder with relative path
    folder.path = exports.getPhotosPath(folder.path);
  }
  if (folder.cover) {
    if (folder.cover.indexOf('/photo_thumbnails/') == 0) {
      // folder.cover = exports.getDataPath(folder.cover);
      folder.cover = path.basename(folder.cover);
    }/* else {
      folder.cover = exports.getThumbnailPath(folder.cover);
    }*/
  }
}

exports.fixFolderPaths = function(folders) {
  folders.forEach(function(folder) {
    exports.fixFolderPath(folder);
  });
}

exports.fixFolderCoverPaths = function(folders) {
  folders.forEach(function(folder) {
    if (folder.cover) {
      if (folder.cover.indexOf('/photo_thumbnails/') == 0) {
        // folder.cover = exports.getDataPath(folder.cover);
        folder.cover = path.basename(folder.cover);
      }/* else {
        folder.cover = exports.getThumbnailPath(folder.cover);
      }*/
    }
  });
}

exports.fixCollectionCoverPaths = function(collections) {
  collections.forEach(function(col) {
    if (col.cover) {
      if (col.cover.indexOf('/photo_thumbnails/') == 0) {
        // col.cover = exports.getDataPath(col.cover);
        col.cover = path.basename(col.cover);
      }/* else {
        col.cover = exports.getThumbnailPath(col.cover);
      }*/
    }
  });
}
