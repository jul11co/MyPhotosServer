angular.module('MyPhotos.controllers.main', [
  'MyPhotos.services.db',
  'MyPhotos.services.import'
])
.controller('mainController', [
  '$scope', '$rootScope', '$interval','$timeout', '$location', '$anchorScroll', '$window', '$document',
  'growl', 'dbService', 'importService',
  function($scope, $rootScope, $interval, $timeout, $location, $anchorScroll, $window, $document,
    growl, dbService, importService){
    
    // var ipc = require('electron').ipcRenderer;

    var bodyRef = angular.element($document[0].body);

    $scope.loading = false;
    $scope.isNavbarCollapsed = false;

    $scope.itemsLoadMode = 'index'; // 'index', 'time'

    /*
    * SECTIONs
    */

    $scope.activeSection = 'photos'; 
    // 'photos', 'folders', 'collections', 'favorites', 'moments', 'import', 'settings'

    $scope.isSectionActive = function(section) {
      return ($scope.activeSection === section);
    }

    $scope.setSectionActive = function(section, reload) {
      // console.log('setSectionActive:', section, reload);
      var previous_action_section = $scope.activeSection;
      $scope.activeSection = section;
      if (section == 'photos' || section == 'moments') { // 'photos', 'moments'
        $timeout(function() {
          if (reload) $scope.loadPhotos();
        }, 500);
      } else if (section == 'collections') { // 'collections'
        $timeout(function() {
          if (reload || $scope.collections.length == 0) $scope.loadCollections();
        }, 500);
      } else if (section == 'favorites') { // 'favorites'
        $timeout(function() {
          if (reload || $scope.favorites.length == 0) $scope.loadFavoritePhotos();
        }, 500);
      } else if (section == 'folders') { // 'folders'
        if ($scope.folderShowing) {
          $scope.folderShowing = false;
          // $scope.loadFolders();
        } else if (previous_action_section == 'folders' || ($scope.folders && $scope.folders.length == 0)) {
          $scope.loadFolders();
        }
        // $timeout(function() {
        //   if (reload) {
        //     $scope.loadFolders();
        //   }
        // }, 500);
      } 
    }

    /*
    * FOLDERS
    */

    $scope.folderFiltering = true;
    $scope.folderSettingsShowing = false;
    $scope.folderActionsEnable = false;

    $scope.folders = [];
    $scope.folderTotal = 0;
    $scope.folderLoaded = 0;
    $scope.folderPerPage = 30;
    $scope.folderCurrentPage = 1;

    $scope.folderFilter = '';
    
    $scope.folderSortBy = 'added_at'; // 'name', 'added_at'
    $scope.folderSortOrder = 'desc'; // 'desc', 'asc'

    $scope.folderViewModes = ['grid', 'details', 'list'] 
    $scope.folderViewModeIndex = 0;
    $scope.folderViewMode = 'grid'; // 'grid', 'details', 'list'

    $scope.folder = {};
    $scope.folderShowing = false;
    $scope.folderPhotoIndex = -1;

    $scope.folderPhoto = {};
    $scope.folderPhotoShowing = false;

    $scope.folderPhotoSortBy = 'added_at'; // 'name', 'size', 'created', 'added_at'
    $scope.folderPhotoSortOrder = 'desc'; // 'desc', 'asc'

    $scope.folderPhotoInfoShowing = false;

    $scope.folderRemoveWithPhotos = false;

    // folders sort

    $scope.isFolderSortBy = function(sort) {
      return ($scope.folderSortBy == sort);
    }

    $scope.setFolderSortBy = function(sort) {
      $scope.folderSortBy = sort;
      if (sort == 'name') $scope.folderSortOrder = 'asc';
      else $scope.folderSortOrder = 'desc';
      $scope.loadFolders();
    }

    $scope.isFolderSortOrder = function(order) {
      return ($scope.folderSortOrder == order);
    }

    $scope.setFolderSortOrder = function(order) {
      $scope.folderSortOrder = order;
      $scope.loadFolders();
    }

    // folder's photos sort

    $scope.isFolderPhotoSortBy = function(sort) {
      return ($scope.folderPhotoSortBy == sort);
    }

    $scope.setFolderPhotoSortBy = function(sort) {
      $scope.folderPhotoSortBy = sort;
      if (sort == 'name') $scope.folderPhotoSortOrder = 'asc';
      else $scope.folderPhotoSortOrder = 'desc';
      $scope.reloadFolderDetails();
    }

    $scope.isFolderPhotoSortOrder = function(order) {
      return ($scope.folderPhotoSortOrder == order);
    }

    $scope.setFolderPhotoSortOrder = function(order) {
      $scope.folderPhotoSortOrder = order;
      $scope.reloadFolderDetails();
    }

    $scope.toggleFolderPhotoInfo = function() {
      $scope.folderPhotoInfoShowing = !$scope.folderPhotoInfoShowing;
    }

    // folders filter

    $scope.toggleFolderFilter = function() {
      $scope.folderFiltering = !$scope.folderFiltering;
    }

    $scope.toggleFolderViewMode = function() {
      $scope.folderViewModeIndex++;
      if ($scope.folderViewModeIndex > 2) $scope.folderViewModeIndex = 0;
      $scope.folderViewMode = $scope.folderViewModes[$scope.folderViewModeIndex];
    }

    $scope.toggleFolderActions = function() {
      $scope.folderActionsEnable = !$scope.folderActionsEnable;
    }

    $scope.toggleFolderSettings = function() {
      $scope.folderSettingsShowing = !$scope.folderSettingsShowing;
    }

    function onFoldersResult(result, append) {
      if (!append) {
        $scope.folders = [];
      }
      result.folders.forEach(function(folder) {
        $scope.folders.push(folder);
      });
      $scope.folderTotal = result.total || result.folders_count || 0;
      $scope.folderPerPage = result.limit || result.folders_limit;
      if (append) {
        $scope.folderLoaded += result.folders.length;
        $scope.folderCurrentPage += 1;
      } else {
        $scope.folderLoaded = result.folders.length;
        $scope.folderCurrentPage = 1;
      }
      // $scope.$apply();
    }

    $scope.loadFolders = function(options) {
      options = options || {};

      if ($scope.loading) return;

      if (!options.append) {
        $scope.folders = [];
      }

      if ($scope.folderShowing) {
        $scope.folderShowing = false;
      }

      // if ($scope.folderSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.folderSortBy == 'name') options.sort = {name: 1};

      options.limit = $scope.folderPerPage;
      options.sort_by = $scope.folderSortBy;
      options.sort_order = $scope.folderSortOrder;

      // console.log('loadFolders: ' + $scope.folderFiltering + ' ' + $scope.folderFilter);
      // console.log('loadFolders');
      // console.log(options);

      if ($scope.folderFiltering && $scope.folderFilter != '') {
        console.log('Folder filter: ' + $scope.folderFilter);
        $scope.loading = true;
        dbService.searchFolders({q: $scope.folderFilter}, options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.folders) {
            console.log(result);
            onFoldersResult(result, options.append);
          }
        });
      } else {
        $scope.loading = true;
        options.has_photos = 1;
        dbService.getFolders(options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.folders) {
            // console.log(result);
            onFoldersResult(result, options.append);
          }
        });
      }
    }

    $scope.loadMoreFolders = function() {
      if ($scope.activeSection != 'folders') {
        return;
      }
      if ($scope.loading || $scope.folderShowing) {
        return;
      }
      if ($scope.folderLoaded >= $scope.folderTotal) {
        return;
      }

      // console.log('Loaded: ' + $scope.folderLoaded + '/' + $scope.folderTotal);

      var options = {};
      options.append = true;
      options.skip = $scope.folderCurrentPage*$scope.folderPerPage;

      // console.log('Skip: ' + options.skip);
      // console.log('loadMoreFolders:', options.skip);

      $scope.loadFolders(options);
    }

    $scope.filterFoldersWithTag = function(tag) {
      $scope.folderFilter = '#' + tag;
      $scope.folderFiltering = true;
      $scope.loadFolders();
    }

    $scope.filterFolders = function() {
      // console.log('filterFolders');
      $scope.folderFiltering = true;
      $scope.loadFolders();
    }

    $scope.clearFolderFilter = function() {
      $scope.folderFilter = '';
      $scope.folderFiltering = false;
      $scope.loadFolders();
    }

    $scope.showFolderDetailsByIndex = function(index) {
      // console.log('showFolderDetailsByIndex:', index);
      var folder = $scope.folders[index];
      $scope.showFolderDetails(folder);
    }

    $scope.showFolderDetails = function(folder) {
      if ($scope.activeSection != 'folders') {
        // $scope.setSectionActive('folders');
        $scope.activeSection = 'folders';
      }

      if ($scope.photoShowing) {
        $scope.closePhotoDetails();
      }

      // console.log('showFolderDetails: ' + folder._id + ' ' + (folder.name));

      $scope.folder = folder;
      $scope.folderShowing = true;
      
      if (!folder.photosLoaded) {
        $scope.folderLoading = true;
        var options = {with_photos: 1,with_subfolders: 1};

        // if ($scope.folderPhotoSortBy == 'added_at') options.sort = {added_at: -1};
        // else if ($scope.folderPhotoSortBy == 'name') options.sort = {name: 1};
        // else if ($scope.folderPhotoSortBy == 'created') options.sort = {created: -1};

        options.limit = $scope.folder.photos_per_page || 50;

        options.sort_by = $scope.folderPhotoSortBy;
        options.sort_order = $scope.folderPhotoSortOrder;

        dbService.getFolder(folder._id, options, function(err, result) {
          $scope.folderLoading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.folder) {
            console.log(result);

            $scope.folder._id = result.folder._id;
            $scope.folder.name = result.folder.name;

            if (result.folder.parent) $scope.folder.parent = result.folder.parent;
            if (result.folder._parent) $scope.folder._parent = result.folder._parent;

            if (result.folder.tags) $scope.folder.tags = result.folder.tags;
            else $scope.folder.tags = [];

            if (result.folders) {
              $scope.folder.folders = result.folders;
              $scope.folder.folders_count = result.folders_count || 0;
              $scope.folder.folders_current_page = 1;
              $scope.folder.folders_per_page = result.folders_limit;
            }

            if (result.photos) {
              $scope.folder.photos_count = result.photos_count || 0;
              $scope.folder.photos_current_page = 1;
              $scope.folder.photos_per_page = result.photos_limit;
              $scope.folder.photos = result.photos;
            }

            $scope.folder.photosLoaded = true;
            // $scope.$apply();
            // console.log(result);
          }
        });
      }
    }

    $scope.reloadFolderDetails = function() {
      if (!$scope.folder._id) return;

      var options = {with_photos: 1,with_subfolders: 1};

      // if ($scope.folderPhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.folderPhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.folderPhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.folder.photos_per_page || 50;

      options.sort_by = $scope.folderPhotoSortBy;
      options.sort_order = $scope.folderPhotoSortOrder;

      $scope.folderLoading = true;
      dbService.getFolder($scope.folder._id, options, function(err, result) {
        $scope.folderLoading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result && result.photos) {
          // console.log(result);

          $scope.folder._id = result.folder._id;
          $scope.folder.name = result.folder.name;

          if (result.folder.parent) $scope.folder.parent = result.folder.parent;
          if (result.folder._parent) $scope.folder._parent = result.folder._parent;

          if (result.folders) {
            $scope.folder.folders = result.folders;
            $scope.folder.folders_count = result.folders_count || 0;
            $scope.folder.folders_current_page = 1;
            $scope.folder.folders_per_page = result.folders_limit;
          }

          if (result.photos) {
            $scope.folder.photos_count = result.photos_count || 0;
            $scope.folder.photos_current_page = 1;
            $scope.folder.photos_per_page = result.photos_limit;
            $scope.folder.photos = result.photos;
          }

          $scope.folder.photosLoaded = true;

          // $scope.$apply();
        }
      });
    }
 
    $scope.closeFolderDetails = function() {
      if ($scope.folder.parent) {
        $scope.showFolderDetails({_id: $scope.folder.parent});
      } else {
        $scope.folderShowing = false;
      }
      // bodyRef.removeClass('ovh');
    }

    $scope.loadMoreSubFolders = function() {
      if ($scope.folderLoading) return;
      if ($scope.folder.folders.length >= $scope.folder.folders_count) return;
      
      var options = {with_subfolders: 1};

      // if ($scope.folderPhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.folderPhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.folderPhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.folder.folders_per_page || 30;

      options.sort_by = $scope.folderPhotoSortBy;
      options.sort_order = $scope.folderPhotoSortOrder;

      if ($scope.itemsLoadMode == 'index') {
        options.skip = $scope.folder.folders_per_page*$scope.folder.folders_current_page;
        // console.log('Skip: ' + skip);
      }
      else if ($scope.folder.folders && $scope.folder.folders.length > 0) {
        if ($scope.folderPhotoSortBy == 'added_at') {
          options.before = new Date($scope.folder.folders[$scope.folder.folders.length-1].added_at).getTime();
        } else { // created
          options.before = new Date($scope.folder.folders[$scope.folder.folders.length-1].created).getTime();
        }
      }

      // console.log('loadMoreSubFolders:', $scope.folder._id);
      // console.log(options);

      $scope.folderLoading = true;
      dbService.getFolder($scope.folder._id, options, function(err, result) {
          $scope.folderLoading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.folders) {
            // console.log(result);

            $scope.folder.folders_count = result.folders_count || 0;
            $scope.folder.folders_current_page += 1;
            $scope.folder.folders_per_page = result.folders_limit;

            if (!$scope.folder.folders) $scope.folder.folders = [];
            result.folders.forEach(function(folder) {
              $scope.folder.folders.push(folder);
            });
          }
        });
    }

    $scope.loadMoreFolderPhotos = function() {
      if ($scope.folderLoading) return;
      if ($scope.folder.photos.length >= $scope.folder.photos_count) return;
      
      var options = {with_photos: 1};

      // if ($scope.folderPhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.folderPhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.folderPhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.folder.photos_per_page || 50;

      options.sort_by = $scope.folderPhotoSortBy;
      options.sort_order = $scope.folderPhotoSortOrder;

      if ($scope.itemsLoadMode == 'index') {
        options.skip = $scope.folder.photos_per_page*$scope.folder.photos_current_page;
        // console.log('Skip: ' + skip);
      }
      else if ($scope.folder.photos && $scope.folder.photos.length > 0) {
        if ($scope.folderPhotoSortBy == 'added_at') {
          options.before = new Date($scope.folder.photos[$scope.folder.photos.length-1].added_at).getTime();
        } else { // created
          options.before = new Date($scope.folder.photos[$scope.folder.photos.length-1].created).getTime();
        }
      }

      console.log('loadMoreFolderPhotos:', $scope.folder._id);
      console.log(options);

      $scope.folderLoading = true;
      dbService.getFolder($scope.folder._id, options, function(err, result) {
          $scope.folderLoading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.photos) {
            console.log(result);

            $scope.folder.photos_count = result.photos_count || 0;
            $scope.folder.photos_current_page += 1;
            $scope.folder.photos_per_page = result.photos_limit;

            if (!$scope.folder.photos) $scope.folder.photos = [];
            result.photos.forEach(function(photo) {
              $scope.folder.photos.push(photo);
            });

            // $scope.$apply();
            if ($scope.folderPhotoShowing) {
              $scope.showFolderPhotoDetailsByIndex($scope.folderPhotoIndex+1);
            }
          }
        });
    }

    $scope.removeFolderByIndex = function(index) {
      var folder = $scope.folders[index];
      var options = {};
      if ($scope.folderRemoveWithPhotos) {
        options.with_photos = 1;
      }
      $scope.loading = true;
      $scope.removeFolder(folder, options, function(err) {
        if (!err) {
          $scope.folders.splice(index, 1);
          // $scope.$apply();
        }
      });
    }
 
    $scope.removeFolder = function(folder, callback) {
      callback = callback || function() {};
      var options = {};
      if ($scope.folderRemoveWithPhotos) {
        options.with_photos = 1;
      }
      $scope.loading = true;
      dbService.removeFolder(folder._id, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          if (result && result.photosRemoved) {
            growl.success('Folder removed: ' + folder.name + ', with ' + result.photosRemoved + ' photos');
          } else {
            growl.success('Folder removed: ' + folder.name);
          }
        }
        callback(err);
      });
    }

    $scope.showSubFolderDetailsByIndex = function(index) {
      var folder = $scope.folder.folders[index];
      $scope.showFolderDetails(folder);
    }

    $scope.showFolderPhotoDetailsByIndex = function(index) {
      $scope.folderPhotoIndex = index;
      var folderPhoto = $scope.folder.photos[index];
      $scope.showPhotoDetails(folderPhoto, {scope: 'folder', backLabel: $scope.folder.name});
    }

    $scope.showFolderPhotoDetails = function(photo) {
      $scope.folderPhoto = photo;
      $scope.folderPhotoShowing = true;
      bodyRef.addClass('ovh');
    }

    $scope.closeFolderPhotoDetails = function() {
      $scope.folderPhotoShowing = false;
      bodyRef.removeClass('ovh');
    }

    $scope.haveNextFolderPhoto = function() {
      return ($scope.folder && $scope.folder.photos && $scope.activeSection == 'folders'
        && ($scope.folderPhotoIndex < $scope.folder.photos.length - 1 
          || $scope.folder.photos_count > $scope.folder.photos.length));
    }

    $scope.showNextFolderPhoto = function() {
      if (!$scope.folder || !$scope.folder.photos) return;
      if ($scope.folderPhotoIndex < $scope.folder.photos.length - 1) {
        $scope.folderPhotoIndex++;
        var folderPhoto = $scope.folder.photos[$scope.folderPhotoIndex];
        $scope.showPhotoDetails(folderPhoto, {
          scope: 'folder', 
          slideType: 'fromright',
          backLabel: $scope.folder.name
        });
      } else if ($scope.folderPhotoIndex >= $scope.folder.photos.length - 2
        && $scope.folder.photos_count > $scope.folder.photos.length) { // preload
        $scope.loadMoreFolderPhotos();
      }
    }

    $scope.havePrevFolderPhoto = function() {
      return ($scope.folder && $scope.folder.photos 
        && ($scope.folderPhotoIndex > 0) && $scope.activeSection == 'folders');
    }

    $scope.showPrevFolderPhoto = function() {
      if ($scope.folderPhotoIndex > 0) {
        $scope.folderPhotoIndex--;
        var folderPhoto = $scope.folder.photos[$scope.folderPhotoIndex];
        // $scope.showFolderPhotoDetails(folderPhoto);
        $scope.showPhotoDetails(folderPhoto, {
          scope: 'folder', 
          slideType: 'fromleft',
          backLabel: $scope.folder.name
        });
      }
    }
 
    // $scope.toggleFolderPathEditing = function(folder) {
    //   folder.editing = !folder.editing;
    // }

    // $scope.editFolderPath = function(folder) {
    //   folder.editing = true;
    // }

    // $scope.selectFolderPath = function(folder) {
    //   // console.log('selectFolderPath');
    //   $scope.browseFolderWithResult(folder.path, function(selectedpath) {
    //     console.log('Selected path: ' + selectedpath);
    //     folder.path = selectedpath;
    //     folder.available = true;
    //     // $scope.$apply();
    //   });
    // }

    // $scope.updateFolderPath = function(folder) {
    //   if (!folder || !folder._id) return;
    //   if (folder.updating) return;

    //   folder.updating = true;
    //   dbService.updateFolder(folder._id, {
    //     path: folder.path
    //   }, function(err) {
    //     folder.updating = false;
    //     folder.editing = false;
    //     if (err) {
    //       growl.error(err.message, {ttl: -1});
    //     } else {
    //       growl.info('Folder path updated: ' + folder.name);
    //     }
    //     // $scope.$apply();
    //   });
    // }

    /*
    * COLLECTIONS
    */

    $scope.collectionFiltering = true;
    $scope.collectionSettingsShowing = false;
    $scope.collectionActionsEnable = false;

    $scope.collection = {};
    $scope.collectionShowing = false;
    $scope.collectionPhotoIndex = -1;

    $scope.collectionViewModes = ['grid', 'details', 'list'] 
    $scope.collectionViewModeIndex = 1;
    $scope.collectionViewMode = 'details'; // 'grid', 'details', 'list'

    $scope.collectionPhoto = {};
    $scope.collectionPhotoShowing = false;

    $scope.collectionFilter = '';

    $scope.collectionSortBy = 'added_at'; // 'name', 'added_at'
    $scope.collectionSortOrder = 'desc'; // 'desc', 'asc'

    $scope.collectionPhotoSortBy = 'added_at'; // 'name', 'created', 'added_at'
    $scope.collectionPhotoSortOrder = 'desc'; // 'desc', 'asc'

    $scope.collectionPhotoInfoShowing = false;

    $scope.collections = [];
    $scope.collectionTotal = 0;
    $scope.collectionLoaded = 0;
    $scope.collectionPerPage = 20;
    $scope.collectionCurrentPage = 1;

    $scope.collectionRemoveWithPhotos = false;

    $scope.isCollectionSortBy = function(sort) {
      return ($scope.collectionSortBy == sort);
    }

    $scope.setCollectionSortBy = function(sort) {
      $scope.collectionSortBy = sort;
      $scope.loadCollections();
    }

    $scope.isCollectionPhotoSortBy = function(sort) {
      return ($scope.collectionPhotoSortBy == sort);
    }

    $scope.setCollectionPhotoSortBy = function(sort) {
      $scope.collectionPhotoSortBy = sort;
      $scope.reloadCollectionDetails();
    }

    $scope.toggleCollectionPhotoInfo = function() {
      $scope.collectionPhotoInfoShowing = !$scope.collectionPhotoInfoShowing;
    }

    $scope.toggleCollectionFilter = function() {
      $scope.collectionFiltering = !$scope.collectionFiltering;
    }

    $scope.toggleCollectionViewMode = function() {
      $scope.collectionViewModeIndex++;
      if ($scope.collectionViewModeIndex > 2) $scope.collectionViewModeIndex = 0;
      $scope.collectionViewMode = $scope.collectionViewModes[$scope.collectionViewModeIndex];
    }

    $scope.toggleCollectionActions = function() {
      $scope.collectionActionsEnable = !$scope.collectionActionsEnable;
    }

    $scope.toggleCollectionSettings = function() {
      $scope.collectionSettingsShowing = !$scope.collectionSettingsShowing;
    }

    function onCollectionsResult(result, append) {
      if (!append) {
        $scope.collections = [];
      }
      result.collections.forEach(function(collection) {
        $scope.collections.push(collection);
      });
      $scope.collectionTotal = result.total || 0;
      $scope.collectionPerPage = result.limit;
      if (append) {
        $scope.collectionLoaded += result.collections.length;
        $scope.collectionCurrentPage += 1;
      } else {
        $scope.collectionLoaded = result.collections.length;
        $scope.collectionCurrentPage = 1;
      }
      // $scope.$apply();
    }

    $scope.loadCollections = function(options) {
      options = options || {};

      if ($scope.loading) return;

      if (!options.append) {
        $scope.collections = [];
      }

      // if ($scope.collectionSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.collectionSortBy == 'name') options.sort = {name: 1};

      options.limit = $scope.collectionPerPage;

      options.sort_by = $scope.collectionSortBy;
      options.sort_order = $scope.collectionSortOrder;

      if ($scope.collectionFiltering && $scope.collectionFilter != '') {
        console.log('Collection filter: ' + $scope.collectionFilter);
        $scope.loading = true;
        dbService.searchCollections({q: $scope.collectionFilter}, options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.collections) {
            onCollectionsResult(result, options.append);
          }
        });
      } else {
        $scope.loading = true;
        dbService.getCollections(options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result) {
            onCollectionsResult(result, options.append);
          }
        });
      }
    }

    $scope.loadMoreCollections = function() {
      if ($scope.activeSection != 'collections') {
        return;
      }
      if ($scope.loading) {
        return;
      }
      if ($scope.collectionLoaded >= $scope.collectionTotal) {
        return;
      }

      // console.log('Loaded: ' + $scope.collectionLoaded + '/' + $scope.collectionTotal);

      var options = {};
      options.append = true;
      options.skip = $scope.collectionCurrentPage*$scope.collectionPerPage;
      // console.log('Skip: ' + options.skip);

      $scope.loadCollections(options);
    }

    $scope.filterCollections = function() {
      $scope.collectionFiltering = true;
      $scope.loadCollections();
    }

    $scope.clearCollectionFilter = function() {
      $scope.collectionFilter = '';
      $scope.collectionFiltering = false;
      $scope.loadCollections();
    }

    $scope.showCollectionDetailsByIndex = function(index) {
      var collection = $scope.collections[index];
      $scope.showCollectionDetails(collection);
    }

    $scope.showCollectionDetails = function(collection) {

      if ($scope.activeSection != 'collections') {
        $scope.setSectionActive('collections');
      }

      // if ($scope.collectionPhotoShowing) {
      //   $scope.closeCollectionPhotoDetails();
      // }

      if ($scope.photoShowing) {
        $scope.closePhotoDetails();
      }

      // bodyRef.addClass('ovh');

      $scope.collection = collection;
      $scope.collectionShowing = true;
      
      if (!collection.photosLoaded) {
        $scope.collectionLoading = true;
        var options = {with_photos: 1};

        // if ($scope.collectionPhotoSortBy == 'added_at') options.sort = {added_at: -1};
        // else if ($scope.collectionPhotoSortBy == 'name') options.sort = {name: 1};
        // else if ($scope.collectionPhotoSortBy == 'created') options.sort = {created: -1};

        options.limit = $scope.collection.photos_per_page || 50;

        options.sort_by = $scope.collectionPhotoSortBy;
        options.sort_order = $scope.collectionPhotoSortOrder;

        dbService.getCollection(collection._id, options, function(err, result) {
          $scope.collectionLoading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.photos) {
            $scope.collection.photos_count = result.total || 0;
            $scope.collection.photos_current_page = 1;
            $scope.collection.photos_per_page = result.limit;
            $scope.collection.photos = result.photos;
            $scope.collection.photosLoaded = true;
            // $scope.$apply();
            // console.log(result);
          }
        });
      }
    }

    $scope.reloadCollectionDetails = function() {
      if (!$scope.collection._id) return;

      var options = {with_photos: 1};

      // if ($scope.collectionPhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.collectionPhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.collectionPhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.collection.photos_per_page || 50;

      options.sort_by = $scope.collectionPhotoSortBy;
      options.sort_order = $scope.collectionPhotoSortOrder;

      $scope.collectionLoading = true;
      dbService.getCollection($scope.collection._id, options, function(err, result) {
        $scope.collectionLoading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result && result.photos) {
          $scope.collection.photos_count = result.total || 0;
          $scope.collection.photos_current_page = 1;
          $scope.collection.photos_per_page = result.limit;
          $scope.collection.photos = result.photos;
          $scope.collection.photosLoaded = true;
          // $scope.$apply();
          // console.log(result);
        }
      });
    }
 
    $scope.closeCollectionDetails = function() {
      $scope.collectionShowing = false;
      // bodyRef.removeClass('ovh');
    }

    $scope.loadMoreCollectionPhotos = function() {
      if ($scope.collectionLoading) return;
      if ($scope.collection.photos.length >= $scope.collection.photos_count) return;
      
      var options = {with_photos: 1};

      // if ($scope.collectionPhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.collectionPhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.collectionPhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.collection.photos_per_page || 50;

      options.sort_by = $scope.collectionPhotoSortBy;
      options.sort_order = $scope.collectionPhotoSortOrder;

      if ($scope.itemsLoadMode == 'index') {
        options.skip = $scope.collection.photos_per_page*$scope.collection.photos_current_page;
        // console.log('Skip: ' + skip);
      }
      else if ($scope.collection.photos && $scope.collection.photos.length > 0) {
        if ($scope.collectionPhotoSortBy == 'added_at') {
          options.before = new Date($scope.collection.photos[$scope.collection.photos.length-1].added_at).getTime();
        } else { // created
          options.before = new Date($scope.collection.photos[$scope.collection.photos.length-1].created).getTime();
        }
      }

      dbService.getCollection($scope.collection._id, options, function(err, result) {
          $scope.collectionLoading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.photos) {
            $scope.collection.photos_count = result.total || 0;
            $scope.collection.photos_current_page += 1;
            $scope.collection.photos_per_page = result.limit;
            result.photos.forEach(function(photo) {
              $scope.collection.photos.push(photo);
            });
            // $scope.$apply();
            if ($scope.collectionPhotoShowing) {
              $scope.showCollectionPhotoDetailsByIndex($scope.collectionPhotoIndex+1);
            }
          }
        });
    }

    $scope.removeCollectionByIndex = function(index) {
      var collection = $scope.collections[index];
      var options = {};
      if ($scope.collectionRemoveWithPhotos) {
        options.with_photos = 1;
      }
      $scope.loading = true;
      $scope.removeCollection(collection, options, function(err) {
        if (!err) {
          $scope.collections.splice(index, 1);
          // $scope.$apply();
        }
      });
    }
 
    $scope.removeCollection = function(collection, callback) {
      callback = callback || function() {};
      var options = {};
      if ($scope.collectionRemoveWithPhotos) {
        options.with_photos = 1;
      }
      $scope.loading = true;
      dbService.removeCollection(collection._id, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          if (result && result.photosRemoved) {
            growl.success('Collection removed: ' + collection.name + ', with ' + result.photosRemoved + ' photos');
          } else {
            growl.success('Collection removed: ' + collection.name);
          }
        }
        callback(err);
      });
    }

    $scope.showCollectionPhotoDetailsByIndex = function(index) {
      $scope.collectionPhotoIndex = index;
      var collectionPhoto = $scope.collection.photos[index];
      // $scope.showCollectionPhotoDetails(collectionPhoto);
      $scope.showPhotoDetails(collectionPhoto, {
        scope: 'collection',
        backLabel: $scope.collection.name
      });
    }

    $scope.showCollectionPhotoDetails = function(photo) {
      $scope.collectionPhoto = photo;
      $scope.collectionPhotoShowing = true;
      bodyRef.addClass('ovh');
    }

    $scope.closeCollectionPhotoDetails = function() {
      $scope.collectionPhotoShowing = false;
      bodyRef.removeClass('ovh');
    }

    $scope.haveNextCollectionPhoto = function() {
      return ($scope.collection && $scope.collection.photos && $scope.activeSection == 'collections'
        && ($scope.collectionPhotoIndex < $scope.collection.photos.length - 1 
          || $scope.collection.photos_count > $scope.collection.photos.length));
    }

    $scope.showNextCollectionPhoto = function() {
      if (!$scope.collection || !$scope.collection.photos) return;
      if ($scope.collectionPhotoIndex < $scope.collection.photos.length - 1) {
        $scope.collectionPhotoIndex++;
        var collectionPhoto = $scope.collection.photos[$scope.collectionPhotoIndex];
        // $scope.showCollectionPhotoDetails(collectionPhoto);
        $scope.showPhotoDetails(collectionPhoto, {
          scope: 'collection', 
          slideType: 'fromright',
          backLabel: $scope.collection.name
        });
      } else if ($scope.collectionPhotoIndex >= $scope.collection.photos.length - 2
        && $scope.collection.photos_count > $scope.collection.photos.length) { // preload
        $scope.loadMoreCollectionPhotos();
      }
    }

    $scope.havePrevCollectionPhoto = function() {
      return ($scope.collection && $scope.collection.photos 
        && ($scope.collectionPhotoIndex > 0) && $scope.activeSection == 'collections');
    }

    $scope.showPrevCollectionPhoto = function() {
      if ($scope.collectionPhotoIndex > 0) {
        $scope.collectionPhotoIndex--;
        var collectionPhoto = $scope.collection.photos[$scope.collectionPhotoIndex];
        // $scope.showCollectionPhotoDetails(collectionPhoto);
        $scope.showPhotoDetails(collectionPhoto, {
          scope: 'collection', 
          slideType: 'fromleft',
          backLabel: $scope.collection.name
        });
      }
    }
 
    /*
    * FAVORITES
    */

    $scope.favoriteFiltering = true;
    $scope.favoriteSettingsShowing = false;
    $scope.favoriteActionsEnable = false;

    $scope.favorites = [];
    $scope.favoriteTotal = 0;
    $scope.favoriteLoaded = 0;
    $scope.favoritePerPage = 20;
    $scope.favoriteCurrentPage = 1;

    $scope.favoriteViewModes = ['grid', 'details', 'list'] 
    $scope.favoriteViewModeIndex = 1;
    $scope.favoriteViewMode = 'details'; // 'grid', 'details', 'list'

    $scope.favorite = {};
    $scope.favoriteShowing = false;
    $scope.favoritePhotoIndex = -1;

    $scope.favoritePhoto = {};
    $scope.favoritePhotoShowing = false;

    $scope.favoriteFilter = '';

    $scope.favoriteSortBy = 'added_at'; // 'name', 'added_at'
    $scope.favoriteSortOrder = 'desc'; // 'desc', 'asc'

    $scope.favoritePhotoSortBy = 'added_at'; // 'name', 'created', 'added_at'
    $scope.favoritePhotoSortOrder = 'desc'; // 'desc', 'asc'

    $scope.favoritePhotoInfoShowing = false;

    $scope.isFavoriteSortBy = function(sort) {
      return ($scope.favoriteSortBy == sort);
    }

    $scope.setFavoriteSortBy = function(sort) {
      $scope.favoriteSortBy = sort;
      $scope.loadFavorites();
    }

    $scope.isFavoritePhotoSortBy = function(sort) {
      return ($scope.favoritePhotoSortBy == sort);
    }

    $scope.setFavoritePhotoSortBy = function(sort) {
      $scope.favoritePhotoSortBy = sort;
      $scope.reloadFavoritePhotos();
    }

    $scope.toggleFavoritePhotoInfo = function() {
      $scope.favoritePhotoInfoShowing = !$scope.favoritePhotoInfoShowing;
    }

    $scope.toggleFavoriteFilter = function() {
      $scope.favoriteFiltering = !$scope.favoriteFiltering;
    }

    $scope.toggleFavoriteViewMode = function() {
      $scope.favoriteViewModeIndex++;
      if ($scope.favoriteViewModeIndex > 2) $scope.favoriteViewModeIndex = 0;
      $scope.favoriteViewMode = $scope.favoriteViewModes[$scope.favoriteViewModeIndex];
    }

    $scope.toggleFavoriteActions = function() {
      $scope.favoriteActionsEnable = !$scope.favoriteActionsEnable;
    }

    $scope.toggleFavoriteSettings = function() {
      $scope.favoriteSettingsShowing = !$scope.favoriteSettingsShowing;
    }

    function onFavoritesResult(result, append) {
      if (!append) {
        $scope.favorites = [];
      }
      result.favorites.forEach(function(favorite) {
        $scope.favorites.push(favorite);
      });
      $scope.favoriteTotal = result.total || 0;
      $scope.favoritePerPage = result.limit;
      if (append) {
        $scope.favoriteLoaded += result.favorites.length;
        $scope.favoriteCurrentPage += 1;
      } else {
        $scope.favoriteLoaded = result.favorites.length;
        $scope.favoriteCurrentPage = 1;
      }
      // $scope.$apply();
    }

    $scope.loadFavorites = function(options) {
      options = options || {};

      if ($scope.loading) return;

      if (!options.append) {
        $scope.favorites = [];
      }

      // if ($scope.favoriteSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.favoriteSortBy == 'name') options.sort = {name: 1};

      options.limit = $scope.favoritePerPage;

      options.sort_by = $scope.favoriteSortBy;
      options.sort_order = $scope.favoriteSortOrder;

      if ($scope.favoriteFiltering && $scope.favoriteFilter != '') {
        console.log('Favorite filter: ' + $scope.favoriteFilter);
        $scope.loading = true;
        dbService.searchFavorites({q: $scope.favoriteFilter}, options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.favorites) {
            onFavoritesResult(result, options.append);
          }
        });
      } else {
        $scope.loading = true;
        dbService.getFavorites(options, function(err, result) {
          $scope.loading = false;
          if (err) {
            // console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result) {
            onFavoritesResult(result, options.append);
          }
        });
      }
    }

    $scope.loadMoreFavorites = function() {
      if ($scope.activeSection != 'favorites') {
        return;
      }
      if ($scope.loading) {
        return;
      }
      if ($scope.favoriteLoaded >= $scope.favoriteTotal) {
        return;
      }

      // console.log('Loaded: ' + $scope.favoriteLoaded + '/' + $scope.favoriteTotal);

      var options = {};
      options.append = true;
      options.skip = $scope.favoriteCurrentPage*$scope.favoritePerPage;
      // console.log('Skip: ' + options.skip);

      $scope.loadFavorites(options);
    }

    $scope.filterFavorites = function() {
      $scope.favoriteFiltering = true;
      $scope.loadFavorites();
    }

    $scope.clearFavoriteFilter = function() {
      $scope.favoriteFilter = '';
      $scope.favoriteFiltering = false;
      $scope.loadFavorites();
    }

    $scope.closeFavoriteDetails = function() {
      $scope.favoriteShowing = false;
      // bodyRef.removeClass('ovh');
    }

    $scope.loadFavoritePhotos = function() {

      if ($scope.activeSection != 'favorites') {
        $scope.setSectionActive('favorites');
      }

      // if ($scope.favoritePhotoShowing) {
      //   $scope.closeFavoritePhotoDetails();
      // }

      if ($scope.photoShowing) {
        $scope.closePhotoDetails();
      }

      // bodyRef.addClass('ovh');

      $scope.favorite = {};
      $scope.favoriteShowing = true;
      
      if (!$scope.favorite.photosLoaded) {
        $scope.favoriteLoading = true;
        var options = {type: 'photo'};

        // if ($scope.favoritePhotoSortBy == 'added_at') options.sort = {added_at: -1};
        // else if ($scope.favoritePhotoSortBy == 'name') options.sort = {name: 1};
        // else if ($scope.favoritePhotoSortBy == 'created') options.sort = {created: -1};

        options.limit = $scope.favorite.photos_per_page || 50;

        options.sort_by = $scope.favoritePhotoSortBy;
        options.sort_order = $scope.favoritePhotoSortOrder;

        dbService.getFavorites(options, function(err, result) {
          $scope.favoriteLoading = false;
          // console.log(result);
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result && result.photos) {
            $scope.favorite.photos_count = result.total || 0;
            $scope.favorite.photos_current_page = 1;
            $scope.favorite.photos_per_page = result.limit;
            $scope.favorite.photos = result.photos;
            $scope.favorite.photosLoaded = true;
            // $scope.$apply();
            // console.log(result);
          }
        });
      }
    }

    $scope.reloadFavoritePhotos = function() {
      if (!$scope.favorite._id) return;

      var options = {type: 'photo'};

      // if ($scope.favoritePhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.favoritePhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.favoritePhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.favorite.photos_per_page || 50;

      options.sort_by = $scope.favoritePhotoSortBy;
      options.sort_order = $scope.favoritePhotoSortOrder;

      $scope.favoriteLoading = true;
      dbService.getFavorites(options, function(err, result) {
        $scope.favoriteLoading = false;
        // console.log(result);
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result && result.photos) {
          $scope.favorite.photos_count = result.total || 0;
          $scope.favorite.photos_current_page = 1;
          $scope.favorite.photos_per_page = result.limit;
          $scope.favorite.photos = result.photos;
          $scope.favorite.photosLoaded = true;
          // $scope.$apply();
          // console.log(result);
        }
      });
    }
 
    $scope.loadMoreFavoritePhotos = function() {
      if ($scope.favoriteLoading) return;
      if ($scope.favorite.photos.length >= $scope.favorite.photos_count) return;
      
      var options = {type: 'photo'};

      // if ($scope.favoritePhotoSortBy == 'added_at') options.sort = {added_at: -1};
      // else if ($scope.favoritePhotoSortBy == 'name') options.sort = {name: 1};
      // else if ($scope.favoritePhotoSortBy == 'created') options.sort = {created: -1};

      options.limit = $scope.favorite.photos_per_page || 50;

      options.sort_by = $scope.favoritePhotoSortBy;
      options.sort_order = $scope.favoritePhotoSortOrder;

      if ($scope.itemsLoadMode == 'index') {
        options.skip = $scope.favorite.photos_per_page*$scope.favorite.photos_current_page;
        // console.log('Skip: ' + skip);
      }
      else if ($scope.favorite.photos && $scope.favorite.photos.length > 0) {
        if ($scope.favoritePhotoSortBy == 'added_at') {
          options.before = new Date($scope.favorite.photos[$scope.favorite.photos.length-1].added_at).getTime();
        } else { // created
          options.before = new Date($scope.favorite.photos[$scope.favorite.photos.length-1].created).getTime();
        }
      }

      dbService.getFavorites(options, function(err, result) {
        $scope.favoriteLoading = false;
        // console.log(result);
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result && result.photos) {
          $scope.favorite.photos_count = result.total || 0;
          $scope.favorite.photos_current_page += 1;
          $scope.favorite.photos_per_page = result.limit;
          result.photos.forEach(function(photo) {
            $scope.favorite.photos.push(photo);
          });
          // $scope.$apply();
          if ($scope.favoritePhotoShowing) {
            $scope.showFavoritePhotoDetailsByIndex($scope.favoritePhotoIndex+1);
          }
        }
      });
    }

    $scope.addFavoritePhoto = function(photo, callback) {
      var options = {};
      $scope.loading = true;
      var item = {item_type: 'photo', item_id: photo._id};
      dbService.addToFavorites(item, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // growl.success('Favorited: ' + photo.name);
          photo.favorited = true;
          if (result.entry) {
            photo.fav_id = result.entry._id;
            photo.fav_added_at = result.entry._id;
          }
        }
      });
    }

    $scope.removeFavoritePhoto = function(photo) {
      if (!photo.fav_id) return;
      var options = {};
      $scope.loading = true;
      dbService.removeFromFavorites(photo.fav_id, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // growl.warning('Unfavorited: ' + photo.name);
          photo.favorited = false;
          delete photo.fav_id;
          delete photo.fav_added_at;
        }
      });
    }

    $scope.removeFavoriteByIndex = function(index) {
      var favorite = $scope.favorites[index];
      var options = {};
      $scope.loading = true;
      $scope.removeFavorite(favorite, options, function(err) {
        $scope.loading = false;
        if (!err) {
          $scope.favorites.splice(index, 1);
          // $scope.$apply();
        }
      });
    }
 
    $scope.removeFavorite = function(favorite, callback) {
      callback = callback || function() {};
      var options = {};
      $scope.loading = true;
      dbService.removeFromFavorites(favorite._id, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          if (result && result.photosRemoved) {
            growl.success('Favorite removed: ' + favorite.name + ', with ' + result.photosRemoved + ' photos');
          } else {
            growl.success('Favorite removed: ' + favorite.name);
          }
        }
        callback(err);
      });
    }

    $scope.showFavoritePhotoDetailsByIndex = function(index) {
      $scope.favoritePhotoIndex = index;
      var favoritePhoto = $scope.favorite.photos[index];
      // $scope.showFavoritePhotoDetails(favoritePhoto);
      $scope.showPhotoDetails(favoritePhoto, {
        scope: 'favorite',
        backLabel: $scope.favorite.name
      });
    }

    $scope.showFavoritePhotoDetails = function(photo) {
      $scope.favoritePhoto = photo;
      $scope.favoritePhotoShowing = true;
      bodyRef.addClass('ovh');
    }

    $scope.closeFavoritePhotoDetails = function() {
      $scope.favoritePhotoShowing = false;
      bodyRef.removeClass('ovh');
    }

    $scope.haveNextFavoritePhoto = function() {
      return ($scope.favorite && $scope.favorite.photos && $scope.activeSection == 'favorites'
        && ($scope.favoritePhotoIndex < $scope.favorite.photos.length - 1 
          || $scope.favorite.photos_count > $scope.favorite.photos.length));
    }

    $scope.showNextFavoritePhoto = function() {
      if (!$scope.favorite || !$scope.favorite.photos) return;
      if ($scope.favoritePhotoIndex < $scope.favorite.photos.length - 1) {
        $scope.favoritePhotoIndex++;
        var favoritePhoto = $scope.favorite.photos[$scope.favoritePhotoIndex];
        // $scope.showFavoritePhotoDetails(favoritePhoto);
        $scope.showPhotoDetails(favoritePhoto, {
          scope: 'favorite', 
          slideType: 'fromright',
          backLabel: $scope.favorite.name
        });
      } else if ($scope.favoritePhotoIndex >= $scope.favorite.photos.length - 2
        && $scope.favorite.photos_count > $scope.favorite.photos.length) { // preload
        $scope.loadMoreFavoritePhotos();
      }
    }

    $scope.havePrevFavoritePhoto = function() {
      return ($scope.favorite && $scope.favorite.photos 
        && ($scope.favoritePhotoIndex > 0) && $scope.activeSection == 'favorites');
    }

    $scope.showPrevFavoritePhoto = function() {
      if ($scope.favoritePhotoIndex > 0) {
        $scope.favoritePhotoIndex--;
        var favoritePhoto = $scope.favorite.photos[$scope.favoritePhotoIndex];
        // $scope.showFavoritePhotoDetails(favoritePhoto);
        $scope.showPhotoDetails(favoritePhoto, {
          scope: 'favorite', 
          slideType: 'fromleft',
          backLabel: $scope.favorite.name
        });
      }
    }
 
    /*
    * PHOTOS
    */

    $scope.photoFiltering = true;
    $scope.photoSettingsShowing = false;
    $scope.photoActionsEnable = false;

    $scope.photo = {};
    $scope.photoShowing = false;
    $scope.photoIndex = -1;

    $scope.photoViewScope = ''; // 'folder', 'collection'

    $scope.photoViewModes = ['grid', 'details', 'list'] 
    $scope.photoViewModeIndex = 0;
    $scope.photoViewMode = 'grid'; // 'grid', 'details', 'list'

    $scope.photoViewFull = false;
    $scope.photoViewOnScreenInfo = true;

    $scope.photoViewAnimationEnabled = false;
    $scope.photoViewAnimation = 'fromtop'; // 'fromleft', 'fromright', 'frombottom'

    $scope.photoFilter = '';

    $scope.photoSortBy = 'added_at'; // 'name', 'added_at', 'created'
    $scope.photoSortOrder = 'desc'; // 'desc', 'asc'

    $scope.photoInfoShowing = false;

    $scope.photos = [];
    $scope.photoTotal = 0;
    $scope.photoLoaded = 0;
    $scope.photoPerPage = 50;
    $scope.photoCurrentPage = 1;

    $scope.photoLoading = false;
    $scope.photoRemoving = false;
    $scope.photoViewShowing = true;

    $scope.photoBackLabel = '';

    $scope.photoScope = {};

    $scope.isPhotoSortBy = function(sort) {
      return ($scope.photoSortBy == sort);
    }

    $scope.setPhotoSortBy = function(sort) {
      $scope.photoSortBy = sort;
      $scope.loadPhotos();
    }

    $scope.isPhotoSortOrder = function(order) {
      return ($scope.photoSortOrder == order);
    }

    $scope.setPhotoSortOrder = function(order) {
      $scope.photoSortOrder = order;
      $scope.loadPhotos();
    }

    $scope.togglePhotoFilter = function() {
      $scope.photoFiltering = !$scope.photoFiltering;
    }

    $scope.togglePhotoInfo = function() {
      $scope.photoInfoShowing = !$scope.photoInfoShowing;
    }

    $scope.togglePhotoViewMode = function() {
      $scope.photoViewModeIndex++;
      if ($scope.photoViewModeIndex > 2) $scope.photoViewModeIndex = 0;
      $scope.photoViewMode = $scope.photoViewModes[$scope.photoViewModeIndex];
    }

    $scope.togglePhotoActions = function() {
      $scope.photoActionsEnable = !$scope.photoActionsEnable;
    }

    $scope.togglePhotoSettings = function() {
      $scope.photoSettingsShowing = !$scope.photoSettingsShowing;
    }

    function onPhotosResult(result, append) {
      if (!append) {
        $scope.photos = [];
      }
      // console.log(result);
      result.photos.forEach(function(photo) {
        $scope.photos.push(photo);
      });
      $scope.photoTotal = result.total || 0;
      $scope.photoPerPage = result.limit;
      if (append) {
        $scope.photoLoaded += result.photos.length;
        $scope.photoCurrentPage += 1;
      } else {
        $scope.photoLoaded = result.photos.length;
        $scope.photoCurrentPage = 1;
      }
      // $scope.$apply();
      if ($scope.photoShowing) {
        $scope.showPhotoDetailsByIndex($scope.photoIndex+1, {
          scope: $scope.photoViewScope, 
          slideType: 'fromright',
          backLabel: 'Photos'
        });
      }
    }

    $scope.loadPhotos = function(options) {
      options = options || {};

      if ($scope.loading) return;

      if (!options.append) {
        $scope.photos = [];
      }

      // if ($scope.photoSortBy == 'added_at') {
      //   options.sort = ($scope.photoSortOrder == 'asc') ? {added_at: 1} : {added_at: -1};
      // }
      // else if ($scope.photoSortBy == 'name') {
      //   options.sort = ($scope.photoSortOrder == 'asc') ? {name: 1} : {name: -1};
      // }
      // else if ($scope.photoSortBy == 'created') {
      //   options.sort = ($scope.photoSortOrder == 'asc') ? {created: 1} : {created: -1};
      // }

      options.limit = $scope.photoPerPage;

      options.sort_by = $scope.photoSortBy;
      options.sort_order =$scope.photoSortOrder;

      if ($scope.photoScope.year) options.year = $scope.photoScope.year;
      if ($scope.photoScope.month) options.month = $scope.photoScope.month;
      if ($scope.photoScope.day) options.day = $scope.photoScope.day;

      if ($scope.photoFiltering && $scope.photoFilter != '') {
        $scope.loading = true;
        dbService.searchPhotos({q: $scope.photoFilter}, options, function(err, result) {
          $scope.loading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result) {
            onPhotosResult(result, options.append);
          }
        });
      } else {
        $scope.loading = true;
        dbService.getPhotos(options, function(err, result) {
          $scope.loading = false;
          if (err) {
            console.log(err.message);
            growl.error(err.message, {ttl: -1});
          } else if (result) {
            // console.log('Photos: ' + result.total);
            onPhotosResult(result, options.append);
          }
        });
      }
    }

    $scope.loadMorePhotos = function() {
      if ($scope.activeSection != 'photos' && $scope.activeSection != 'moments') {
        return;
      }
      if ($scope.loading) {
        return;
      }
      if ($scope.photoLoaded >= $scope.photoTotal) {
        return;
      }

      // console.log('Loaded: ' + $scope.photoLoaded + '/' + $scope.photoTotal);

      var options = {};
      options.append = true;

      if ($scope.itemsLoadMode == 'index') {
        options.skip = $scope.photoCurrentPage*$scope.photoPerPage;
        // console.log('Skip: ' + options.skip);
      } else if ($scope.photos.length > 0) {
        if ($scope.photoSortBy == 'created') {
          options.before = new Date($scope.photos[$scope.photos.length-1].created).getTime();
        } else if ($scope.photoSortBy == 'added_at') {
          options.before = new Date($scope.photos[$scope.photos.length-1].added_at).getTime();
        }
      }

      $scope.loadPhotos(options);
    }

    $scope.filterPhotos = function() {
      if ($scope.photoFilter && $scope.photoFilter.length == 1) return;
      $scope.photoFiltering = true;
      $scope.loadPhotos();
    }

    $scope.clearPhotoFilter = function() {
      $scope.photoFilter = '';
      $scope.photoFiltering = false;
      $scope.loadPhotos();
    }
    
    // Photo View (Photo Details)

    $scope.toggleFullPhoto = function() {
      $scope.photoViewFull = !$scope.photoViewFull;
    }

    $scope.showPhotoDetailsByIndex = function(index, options) {
      options = options || {};
      var photo = {};
      var scope = options.scope;
      if (scope == 'folder') {
        $scope.folderPhotoIndex = index;
        $scope.photoIndex = $scope.folderPhotoIndex;
        photo = $scope.folder.photos[$scope.folderPhotoIndex];
      } else if (scope == 'collection') {
        $scope.collectionPhotoIndex = index;
        $scope.photoIndex = $scope.collectionPhotoIndex;
        photo = $scope.collection.photos[$scope.collectionPhotoIndex];
      } else if (scope == 'favorite') {
        $scope.favoritePhotoIndex = index;
        $scope.photoIndex = $scope.favoritePhotoIndex;
        photo = $scope.favorite.photos[$scope.favoritePhotoIndex];
      } else {
        $scope.photoIndex = index;
        photo = $scope.photos[$scope.photoIndex];
      }
      $scope.showPhotoDetails(photo, options);
    }

    $scope.showPhotoDetails = function(photo, options) {
      options = options || {};
      var scope = options.scope;
      var slideType = options.slideType;
      $scope.photoViewAnimation = ($scope.photoViewAnimationEnabled) ? (slideType || '') : '';
      $scope.photoViewScope = scope;
      if ($scope.photoViewScope == 'folder' && !photo._folder) {
        photo._folder = $scope.folder;
      } else if ($scope.photoViewScope == 'collection' && !photo._collections && !photo._collections) {
        photo._collections = [$scope.collection];
      } else if (photo && photo._collections && photo._collections.length) {
        photo._collection = photo._collections[0];
      }
      // console.log(photo);
      if (options.backLabel) $scope.photoBackLabel = options.backLabel;
      else $scope.photoBackLabel = 'Photos';
      $scope.photo = photo;
      $scope.photoShowing = true;
      bodyRef.addClass('ovh');
      // $window.scrollTo(0, 0);
      if (!$scope.photoViewAnimationEnabled || !$scope.photoViewShowing) {
        $scope.photoViewShowing = true;
        // $window.scrollTo(0, 0);
      } else {
        $scope.photoViewShowing = false;
        $timeout(function() {
          $scope.photoViewShowing = true;
          // $window.scrollTo(0, 0);
        }, 20);
      }
    }

    $scope.closePhotoDetails = function() {
      $scope.photoShowing = false;
      bodyRef.removeClass('ovh');
    }

    $scope.getPhotoByIndex = function(index) {
      var photo = {};
      if ($scope.photoViewScope == 'folder') {
        photo = $scope.folder.photos[index];
      } else if ($scope.photoViewScope == 'collection') {
        photo = $scope.collection.photos[index];
      } else if ($scope.photoViewScope == 'favorite') {
        photo = $scope.favorite.photos[index];
      } else {
        photo = $scope.photos[index];
      }
      return photo;
    }

    $scope.photoCurrentIndex = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.folderPhotoIndex;
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.collectionPhotoIndex;
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.favoritePhotoIndex;
      }
      return $scope.photoIndex;
    }

    $scope.photoTotalIndex = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.folder.photos_count;
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.collection.photos_count;
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.favorite.photos_count;
      }
      return $scope.photoTotal;
    }

    $scope.havePrevPhoto = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.havePrevFolderPhoto();
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.havePrevCollectionPhoto();
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.havePrevFavoritePhoto();
      }
      return ($scope.photoIndex > 0 
        && ($scope.activeSection == 'photos' || $scope.activeSection == 'moments'));
    }

    $scope.showPrevPhoto = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.showPrevFolderPhoto();
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.showPrevCollectionPhoto();
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.showPrevFavoritePhoto();
      } else {
        if ($scope.photoIndex > 0) {
          $scope.photoIndex--;
          var photo = $scope.photos[$scope.photoIndex];
          $scope.showPhotoDetails(photo, { 
            scope: $scope.photoViewScope, 
            slideType: 'fromleft'
          });
        }
      }
    }
 
    $scope.haveNextPhoto = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.haveNextFolderPhoto();
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.haveNextCollectionPhoto();
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.haveNextFavoritePhoto();
      }
      return (($scope.activeSection == 'photos' || $scope.activeSection == 'moments')
        && ($scope.photoIndex < ($scope.photos.length-1) || $scope.photoTotal > $scope.photoLoaded)) ;
    }

    $scope.showNextPhoto = function() {
      if ($scope.photoViewScope == 'folder') {
        return $scope.showNextFolderPhoto();
      } else if ($scope.photoViewScope == 'collection') {
        return $scope.showNextCollectionPhoto();
      } else if ($scope.photoViewScope == 'favorite') {
        return $scope.showNextFavoritePhoto();
      } else {
        if ($scope.photoIndex < ($scope.photos.length-1)) {
          $scope.photoIndex++;
          var photo = $scope.photos[$scope.photoIndex];
          $scope.showPhotoDetails(photo, {
            scope: $scope.photoViewScope, 
            slideType: 'fromright'
          });
        } else if ($scope.photoIndex >= ($scope.photos.length-2)
          && $scope.photoTotal > $scope.photoLoaded) { // preload
          $scope.loadMorePhotos();
        } 
      }
    }

    $scope.toggleCurrentPhotoFavorite = function() {
      var photo = $scope.getPhotoByIndex($scope.photoCurrentIndex());
      if (!photo.favorited) {
        $scope.addFavoritePhoto(photo);
      } else {
        $scope.removeFavoritePhoto(photo);
      }
    }

    $scope.favoriteCurrentPhoto = function() {
      var photo = $scope.getPhotoByIndex($scope.photoCurrentIndex());
      if (!photo.favorited) {
        $scope.addFavoritePhoto(photo);
      }
    }

    $scope.unfavoriteCurrentPhoto = function() {
      var photo = $scope.getPhotoByIndex($scope.photoCurrentIndex());
      if (photo.favorited) {
        $scope.removeFavoritePhoto(photo);
      }
    }

    $scope.removeCurrentPhoto = function(remove_from_disk) {
      $scope.removePhotoByIndex($scope.photoCurrentIndex(), remove_from_disk);
    }
 
    $scope.removePhotoByIndex = function(index, remove_from_disk) {
      var photo = $scope.getPhotoByIndex(index);
      $scope.photoRemoving = false;
      $scope.removePhoto(photo, {remove_from_disk: remove_from_disk}, function(err) {
        if (!err) {
          if ($scope.photoViewScope == 'folder') {
            if (index == $scope.folderPhotoIndex && $scope.photoShowing) {
              $scope.showNextFolderPhoto();
            }
            $scope.folder.photos.splice(index, 1);
          } else if ($scope.photoViewScope == 'collection') {
            if (index == $scope.collectionPhotoIndex && $scope.photoShowing) {
              $scope.showNextCollectionPhoto();
            }
            $scope.collection.photos.splice(index, 1);
          } else if ($scope.photoViewScope == 'favorite') {
            if (index == $scope.favoritePhotoIndex && $scope.photoShowing) {
              $scope.showNextFavoritePhoto();
            }
            $scope.collection.photos.splice(index, 1);
          } else {
            if (index == $scope.photoIndex && $scope.photoShowing) {
              $scope.showNextPhoto();
            }
            $scope.photos.splice(index, 1);
          }
          // $scope.$apply();
        }
      });
    }

    $scope.removePhoto = function(photo, options, callback) {
      if (typeof options == 'function') {
        callback = options;
        options = {};
      }
      options = options || {};
      callback = callback || function() {};
      $scope.loading = true;
      dbService.removePhoto(photo._id, options, function(err, result) {
        $scope.loading = false;
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          if (result.error) {
            growl.error(result.error, {ttl: -1});
          } else if (result.success) {
            growl.success('Photo removed: ' + photo.name);
          }
        }
        callback(err);
      });
    }

    $scope.togglePhotoViewOnScreenInfo = function() {
      $scope.photoViewOnScreenInfo = !$scope.photoViewOnScreenInfo;
    }

    /*
    * KEY BINDINGS
    */

    var keyPressHandler = function(event) {
      if(!$scope.$$phase) {
          $scope.$apply(function() {
          if ($scope.photoShowing) {
            if (event.which == 37) { // left
              if ($scope.havePrevPhoto()) {
                event.preventDefault();
                $scope.showPrevPhoto();
              }
            } else if (event.which == 39) { // right
              if ($scope.haveNextPhoto()) {
                event.preventDefault();
                $scope.showNextPhoto();
              }
            } else if (event.which == 38) { // up
              event.preventDefault();
              $scope.favoriteCurrentPhoto();
            } else if (event.which == 40) { // down
              event.preventDefault();
              $scope.unfavoriteCurrentPhoto();
            } else if (event.which == 27) { // esc
              event.preventDefault();
              $scope.closePhotoDetails();
            } else if (event.which == 32) { // space
              event.preventDefault();
              $scope.togglePhotoViewOnScreenInfo();
            } else if (event.which == 70) { // 'f'
              event.preventDefault();
              $scope.toggleFullPhoto();
            }
          } else if ($scope.folderShowing && event.which == 27) { // esc
            event.preventDefault();
            $scope.closeFolderDetails();
          }
        });
      }
    };

    bodyRef.bind('keydown', keyPressHandler);

    $scope.$on('$destroy', function() {
      bodyRef.unbind('keydown', keyPressHandler);
    });

    $scope.onKeyPress = keyPressHandler;

    /*
    * STATS
    */

    $scope.dateStats = [];
    $scope.tagStats = [];

    $scope.photosCount = 0;
    $scope.foldersCount = 0;
    $scope.collectionsCount = 0;
    $scope.foldersCount = 0;
    $scope.favoritesCount = 0;

    $scope.momentsSortType = 'date'; // 'date', 'count'
    $scope.momentsSortOrder = 'desc'; // 'desc', 'asc'

    var expandedMoments = {};

    var month_names = [
      'January', 'Febuary', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    var areSameYear = function(date1, date2) {
      if (!date1 || !date2) return false;
      if (!date1.getFullYear) date1 = new Date(date1);
      if (!date2.getFullYear) date2 = new Date(date2);
      return date1.getFullYear() == date2.getFullYear();
    }
    $scope.areSameYear = areSameYear;

    var areSameMonth = function(date1, date2) {
      if (!date1 || !date2) return false;
      if (!date1.getFullYear) date1 = new Date(date1);
      if (!date2.getFullYear) date2 = new Date(date2);
      return date1.getFullYear() == date2.getFullYear()
        && date1.getMonth() == date2.getMonth();
    }
    $scope.areSameMonth = areSameMonth;

    var areSameDay = function(date1, date2) {
      if (!date1 || !date2) return false;
      if (!date1.getFullYear) date1 = new Date(date1);
      if (!date2.getFullYear) date2 = new Date(date2);
      return date1.getFullYear() == date2.getFullYear()
        && date1.getMonth() == date2.getMonth()
        && date1.getDate() == date2.getDate();
    }
    $scope.areSameDay = areSameDay;

    $scope.getPhotosCount = function(options) {
      dbService.getPhotosCount(function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // console.log(result);
          if (result && result.count) {
            $scope.photosCount = result.count;
            // $scope.$apply();
          }
        }
      });
    }

    $scope.getFoldersCount = function(options) {
      dbService.getFoldersCount(function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // console.log(result);
          if (result && result.count) {
            $scope.foldersCount = result.count;
            // $scope.$apply();
          }
        }
      });
    }

    $scope.getCollectionsCount = function(options) {
      dbService.getCollectionsCount(function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // console.log(result);
          if (result.count) {
            $scope.collectionsCount = result.count;
            // $scope.$apply();
          }
        }
      });
    }

    $scope.getFavoritesCount = function(options) {
      dbService.getFavoritesCount(function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // console.log(result);
          if (result.count) {
            $scope.favoritesCount = result.count;
            // $scope.$apply();
          }
        }
      });
    }

    $scope.getCounts = function(options) {
      options.output = 'count';
      dbService.getStats(options, function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result) {
          // console.log(result);
          if (typeof result.folders_count != 'undefined') $scope.foldersCount = result.folders_count;
          if (typeof result.collections_count != 'undefined') $scope.collectionsCount = result.collections_count;
          if (typeof result.photos_count != 'undefined') $scope.photosCount = result.photos_count;
          if (typeof result.favorites_count != 'undefined') $scope.favoritesCount = result.favorites_count;
          // $scope.$apply();
        }
      });
    }

    $scope.loadTagStats = function(options) {
      options = options || {};

      options.output = 'tag';
      dbService.getStats(options, function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else {
          // console.log(result);
          if (result && result.tags) {
            $scope.tagStats = result.tags.slice();
          }
          // $scope.$apply();
        }
      });
    }

    $scope.loadDateStats = function(options) {
      options = options || {};

      options.output = 'date';
      dbService.getStats(options, function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result) {
          // console.log(result);
          if (result.dates) {
            var years = [];
            var months = [];
            var days = [];
            result.dates.forEach(function(datestat) {
              datestat.date = new Date(datestat.date);
              if (datestat.scope == 'year') {
                years.push(datestat);
              } else if (datestat.scope == 'month') {
                months.push(datestat);
              } else if (datestat.scope == 'day') {
                days.push(datestat);
              }
            });
            days.forEach(function(day) {
              for (var i = 0; i < months.length; i++) {
                var month = months[i];
                if (areSameMonth(month.date, day.date)) {
                  if (!month.days) month.days = [];
                  month.days.push(day);
                  break;
                }
              }
            });
            months.forEach(function(month) {
              for (var i = 0; i < years.length; i++) {
                var year = years[i];
                if (areSameYear(year.date, month.date)) {
                  if (!year.months) year.months = [];
                  year.months.push(month);
                  break;
                }
              }
            });
            var sortFunc = function(a, b) {
              if (a.date > b.date) return -1;
              if (a.date < b.date) return 1;
              return 0;
            };
            if ($scope.momentsSortType == 'count') {
              sortFunc = function(a, b) {
                if (a.count > b.count) return -1;
                if (a.count < b.count) return 1;
                return 0;
              }
            }
            // console.log(years);
            years.sort(sortFunc);
            years.forEach(function(year) {
              if (expandedMoments['year-' + year.date.getTime()]) {
                year.expanded = true;
              }
              if (year.months) {
                year.months.sort(sortFunc);
                year.months.forEach(function(month) {
                  if (expandedMoments['month-' + month.date.getTime()]) {
                    month.expanded = true;
                  }
                  if (month.days) month.days.sort(sortFunc);
                });
              }
            });
            $scope.dateStats = years;
            // $scope.$apply();
          }
        }
      });
    }

    $scope.isDateScopeActive = function(datestat) {
      return $scope.photoScope.scope == datestat.scope
        && $scope.photoScope.year == datestat.date.getFullYear()
        && $scope.photoScope.month == datestat.date.getMonth()
        && $scope.photoScope.day == datestat.date.getDate();
    }

    $scope.loadPhotosOfDateStat = function(datestat) {
      // console.log('loadPhotosOfDateStat:', datestat);
      if (datestat.scope == 'year') {
        datestat.expanded = !datestat.expanded;
        expandedMoments['year-' + datestat.date.getTime()] = datestat.expanded;
        if (datestat.expanded) {
          $scope.setSectionActive('moments');
          $scope.photoScope = {
            title: '' + datestat.date.getFullYear(),
            scope: datestat.scope,
            year: datestat.date.getFullYear()
          };
          $scope.loadPhotos();
        }
      } else if (datestat.scope == 'month') {
        datestat.expanded = !datestat.expanded;
        expandedMoments['month-' + datestat.date.getTime()] = datestat.expanded;
        if (datestat.expanded) {
          $scope.setSectionActive('moments');
          $scope.photoScope = {
            title: '' + datestat.date.getFullYear() + ' ' + month_names[datestat.date.getMonth()],
            scope: datestat.scope,
            year: datestat.date.getFullYear(),
            month: datestat.date.getMonth()
          };
          $scope.loadPhotos();
        }
      } else if (datestat.scope == 'day') {
        $scope.setSectionActive('moments');
        $scope.photoScope = {
          title: '' + datestat.date.getFullYear() + ' ' + month_names[datestat.date.getMonth()]
            + ' ' + datestat.date.getDate(),
          scope: datestat.scope,
          year: datestat.date.getFullYear(),
          month: datestat.date.getMonth(),
          day: datestat.date.getDate()
        };
        $scope.loadPhotos();
      }
    }

    /*
    * IMPORTING
    */

    $scope.importShowing = false;

    $scope.importDataSource = 'localdisk';
    // 'localdisk', 'tumblr', 'pinterest'

    $scope.importSelectedDir = '';
    $scope.importSelectedURL = '';

    $scope.importType = 'folder'; // 'folder'
    $scope.importRescan = false;

    $scope.importMode = 'no-collection'; // 'folder-as-collection', 'to-specific-collection', 'no-collection'
    $scope.importCollection = false;
    $scope.importSelectedCollection = '';
    $scope.importRecursive = true;

    $scope.importMinWidth = 200;
    $scope.importMinHeight = 200;

    $scope.importPinterestMaxImages = 200;

    $scope.importNewPhotosPreviewMax = 5;

    $scope.importQueue = [];

    $scope.currentImport = {
      // data_source: 'localdisk', // 'localdisk', 'pinterest', 'tumblr'
      // input_dir: '',
      // input_url: '',
      // output_dir: '',
      // photo_auto_collection: false,
      // photo_collection: false,
      // photo_collection_name: '',
      // photo_min_width: 200,
      // photo_min_height: 200,
      // max_images: 1000,
      // ...
      // importing: false,
      // completed: false,
      // progress: {
      //   current_file: ''
      //   current: 0,
      //   total: 0,
      //   percent: 0.0,
      //   imported: 0,
      //   imported_percent: 0.0
      // },
      // newPhotos: [],
      // result: {
      //   dirs: 0,
      //   files: 0,
      //   imported: 0,
      //   errors: 0
      // }
    };

    $scope.importDataSourceChange = function() {
      console.log('Current data source:', $scope.importDataSource);
    }

    $scope.showImportDialog = function(import_type) {
      // bodyRef.addClass('ovh');
      $scope.importShowing = true;
    }

    $scope.closeImportDialog = function() {
      $scope.importShowing = false;
      // bodyRef.removeClass('ovh');
    }

    $scope.setImportType = function(type) {
      $scope.importType = type;
    }

    $scope.isImportType = function(type) {
      return ($scope.importType == type);
    }

    $scope.toggleImportRescan = function() {
      $scope.importRescan = !$scope.importRescan;
    }

    var getImportItem = function(added_at) {
      var import_item = null;
      if ($scope.importQueue.length == 0) return import_item;
      for (var i = 0; i < $scope.importQueue.length; i++) {
        var item = $scope.importQueue[i];
        if (item.added_at && item.added_at == added_at) {
          import_item = item;
          break;
        }
      }
      return import_item;
    }

    var getNextImportItem = function() {
      var import_item = null;
      if ($scope.importQueue.length == 0) return import_item;
      for (var i = 0; i < $scope.importQueue.length; i++) {
        var item = $scope.importQueue[i];
        if (!item.completed) {
          import_item = item;
          break;
        }
      }
      return import_item;
    }

    var removeImportItem = function(timestamp) {
      var import_item_index = -1;
      for (var i = 0; i < $scope.importQueue.length; i++) {
        var item = $scope.importQueue[i];
        if (item.added_at && item.added_at == timestamp) {
          import_item_index = i;
          break;
        }
      }
      if (import_item_index != -1) {
        $scope.importQueue.splice(i, 1);
      }
    }

    // Importer's events

    $rootScope.$on('importer-queue', function(event, data) {
      if (data && data.import_queue) {
        console.log('Import queue: ' + data.import_queue.length);
        $scope.importQueue = data.import_queue;
      }
    });

    $rootScope.$on('importer-processing', function(event, data) {
      // console.log('Current import');
      if (data && data.import_item) {
        $scope.currentImport = data.import_item;
        if (data.import_item.importing) {
          $scope.currentImport.importing = true;
          $scope.importing = true;
        }
        $scope.$apply();
      }
    });

    $rootScope.$on('importer-removed', function(event, data) {
      if (data && data.item_timestamp) {
        removeImportItem(data.item_timestamp);
      }
    });

    $rootScope.$on('importer-started', function(event, data) {
      // console.log('Importer started');
      if (data && data.import_item) {
        $scope.currentImport = import_item;
        $scope.currentImport.progress = {};

        $scope.currentImport.progress.current = 0;
        $scope.currentImport.progress.total = 0;
        $scope.currentImport.progress.percent = 0;
        $scope.currentImport.progress.imported = 0;
        $scope.currentImport.progress.imported_percent = 0;

        $scope.currentImport.newPhotos = [];

        $scope.currentImport.importing = true;
      }
      $scope.importing = true;
      // $scope.$apply();
    });

    $rootScope.$on('importer-progress', function(event, data) {
      // console.log('Importer progress: ' + data.current + '/' + data.total);
      if (!$scope.currentImport.progress) $scope.currentImport.progress = {};

      $scope.currentImport.progress.current = data.current;
      $scope.currentImport.progress.total = data.total;
      if ($scope.currentImport.progress.total && $scope.currentImport.progress.current) {
        $scope.currentImport.progress.percent = 
          Math.floor($scope.currentImport.progress.current/$scope.currentImport.progress.total*100);
      }

      if (data.imported) {
        $scope.currentImport.progress.imported = data.imported;
      }
      
      if (data.file && data.file.path) {
        $scope.currentImport.progress.current_file = data.file.path;
      }
      // $scope.$apply();
    });

    $rootScope.$on('importer-imported', function(event, data) {
      // console.log('Importer imported: ' + data.type);
      if (data.type == 'photo') {
        if (!$scope.currentImport.newPhotos) $scope.currentImport.newPhotos = [];
        if (!$scope.currentImport.progress) $scope.currentImport.progress = {};

        // console.log('new photo: ' + data.photo.name);
        if ($scope.currentImport.newPhotos.length >= $scope.importNewPhotosPreviewMax) {
          $scope.currentImport.newPhotos.pop();
        }
        $scope.currentImport.newPhotos.unshift(data.photo);

        if ($scope.currentImport.progress.total) {
          $scope.currentImport.progress.imported_percent = 
            Math.floor($scope.currentImport.progress.imported/$scope.currentImport.progress.total*100);
        }
        // $scope.$apply();
      }
    });

    $rootScope.$on('importer-log', function(event, data) {
      console.log('Importer log:', data);
    });

    $rootScope.$on('importer-error', function(event, data) {
      if (data.error) {
        growl.error(data.error.message);
      }
    });

    $rootScope.$on('importer-stopped', function(event, data) {
      // console.log('Importer stopped');
      $scope.importing = false;

      if (data && data.err) {
        if (data.err.message) {
          growl.error(data.err.message, {ttl: -1});
        } else {
          growl.warning('Importer stopped');
        }
      } 
      if (data && data.files) {
        if (data.errors) {
          growl.warning(data.files + ' files, ' + 
            data.dirs + ' directories scanned.\n ' +
            data.imported + ' imported.\n ' +
            data.errors + ' errors.', {ttl: -1});
        } else {
          growl.success(data.files + ' files, ' + 
            data.dirs + ' directories scanned.\n ' +
            data.imported + ' imported.\n ' +
            data.errors + ' errors.');
        }
      }

      $scope.currentImport.completed = true;
      $scope.currentImport.importing = false;
      $scope.importing = false;

      var import_item = getImportItem($scope.currentImport.added_at);
      if (import_item) {
        if (data) {
          import_item.result = {
            dirs: data.dirs,
            files: data.files,
            imported: data.imported,
            errors: data.errors
          };
        }

        import_item.completed = true;
        import_item.importing = false;
      }
      // $scope.$apply();

      // var next_import = getNextImportItem();
      // if (next_import) {
      //   setTimeout(function() {
      //     startImportItem(next_import);
      //   }, 5000);
      // }
    });

    $scope.selectDirectory = function() {
      // $scope.showImportDialog();
      if (typeof import_type != 'undefined') {
        $scope.importType = import_type;
      }
      $scope.browseFolderWithResult($scope.importSelectedDir, function(selected_path) {
        if (selected_path) {
          $scope.importSelectedDir = selected_path;
          $scope.setSectionActive('import');
          // $scope.$apply();
        }
      });
    }

    var getImportOptions = function() {
      var import_options = {
        photo: true,
        ignore_errors: true, 
        force_update: true
      };

      import_options.data_source = $scope.importDataSource;

      if ($scope.importDataSource == 'localdisk') {
        import_options.input_dir = $scope.importSelectedDir;

        console.log('Import from dir: ' + $scope.importSelectedDir);

        if ($scope.importRecursive) {
          import_options.recursive = true;
        }
      } else {
        import_options.input_url = $scope.importSelectedURL;
        import_options.output_dir = $scope.importSelectedDir;

        if ($scope.importDataSource == 'pinterest') {
          import_options.max_images = $scope.importPinterestMaxImages;
        }
      }

      if ($scope.importMode == 'to-specific-collection' && $scope.importSelectedCollection != '') {
        import_options.photo_collection = true;
        import_options.photo_collection_name = $scope.importSelectedCollection;
      }
      if ($scope.importMode == 'folder-as-collection') {
        import_options.photo_auto_collection = true;
      }
      if ($scope.importMinWidth) {
        import_options.photo_min_width = $scope.importMinWidth;
      }
      if ($scope.importMinHeight) {
        import_options.photo_min_height = $scope.importMinHeight;
      }

      // if ($scope.importRescan) {
      //   import_options.rescan = true;
      // }

      return import_options;
    }

    var startImportItem = function(import_item) {
      if (!import_item) return;

      console.log('Start import:', import_item);

      $scope.currentImport = import_item;
      $scope.currentImport.progress = {};

      $scope.currentImport.progress.current = 0;
      $scope.currentImport.progress.total = 0;
      $scope.currentImport.progress.percent = 0;
      $scope.currentImport.progress.imported = 0;
      $scope.currentImport.progress.imported_percent = 0;

      $scope.currentImport.newPhotos = [];

      $scope.currentImport.importing = true;

      $scope.importing = true;

      importService.startImport(import_item);
    }

    $scope.startImport = function() {
      var import_item = getImportOptions();
      import_item.progress = {};
      import_item.newPhotos = [];

      $scope.importQueue.unshift(import_item);

      $scope.importShowing = false;

      // if (!$scope.importing) {
      //   startImportItem(import_item);
      // }

      importService.startImport(import_item);
    }

    $scope.stopImport = function() {
      importService.stopImport();
    }

    $scope.removeImportItem = function(index) {
      var import_item = $scope.importQueue[index];
      if (import_item && import_item.added_at && !import_item.importing) {
        importService.removeImport(import_item.added_at);
        // $scope.importQueue.splice(index, 1);
      }
    }

    /* FOLDER BROWSER */

    $scope.folderBrowserShowing = false;

    $scope.currentPath = 'HOME';
    $scope.currentFolders = [];
    $scope.currentFiles = [];

    var onSelectedFolder = function(selected_path){
      console.log('Selected path:', selected_path);
    };

    $scope.selectCurrentFolder = function() {
      console.log('selectCurrentFolder');
      console.log('Selected folder:', $scope.currentPath);
      $scope.folderBrowserShowing = false;
      if (typeof onSelectedFolder == 'function') {
        onSelectedFolder($scope.currentPath);
      }
    }

    $scope.browseFolderWithResult = function(default_path, on_selected) {
      if (typeof default_path == 'function') {
        onSelectedFolder = default_path;
      } else {
        onSelectedFolder = on_selected || function() {};
      }
      $scope.browseFolder(default_path);
    }

    $scope.browseFolder = function(default_path) {
      if (!$scope.folderBrowserShowing) {
        $scope.folderBrowserShowing = true;
      }

      if (default_path == '..') {
        var p = $scope.currentPath.split('/');
        p.pop();
        $scope.currentPath = '/' + p.join('/');
      } else if (default_path) {
        $scope.currentPath = default_path;
      }

      importService.browseFiles($scope.currentPath, {}, function(err, result) {
        if (err) {
          console.log(err.message);
          growl.error(err.message, {ttl: -1});
        } else if (result && result.files) {
          $scope.currentPath = result.path;
          $scope.currentFolders = result.files.filter(function(file) {
            return file.type == 'folder';
          });
          $scope.currentFiles = result.files.filter(function(file) {
            return file.type.indexOf('file/') == 0;
          });
        }
      });
    }

    /*
    * SETTINGS
    */

    $scope.settingsPhotosDirectory = '';

    $scope.selectPhotosDirectory = function() {
      // console.log('selectPhotosDirectory');
      $scope.browseFolderWithResult($scope.settingsPhotosDirectory, function(selectedpath) {
        if (selectedpath) {
          // console.log('Selected path: ' + selectedpath);
          $scope.settingsPhotosDirectory = selectedpath;
          // $scope.$apply();
        }
      });
    }

    $scope.selectDefaultImportDirectory = function() {
      // console.log('selectDefaultImportDirectory');
      $scope.browseFolderWithResult($scope.settingsImportDirectory, function(selectedpath) {
        if (selectedpath) {
          // console.log('Selected path: ' + selectedpath);
          $scope.settingsImportDirectory = selectedpath;
          // $scope.$apply();
        }
      });
    }

    function loadSettings() {
      dbService.getSettings({}, function(err, settings) {
        if (err) {
          console.log('Load settings failed');
          console.log(err);
        } else if (settings) {
          // console.log(settings);
          $scope.settingsPhotosDirectory = settings.photosDirectory || '';
          if (settings.importDirectory) {
            $scope.importSelectedDir = settings.importDirectory;
            $scope.settingsImportDirectory = settings.importDirectory;
          }
        }
      });
    }

    $scope.saveSettings = function() {
      var settings = {
        photosDirectory: $scope.settingsPhotosDirectory,
        importDirectory: $scope.settingsImportDirectory
      }
      dbService.saveSettings(settings, {}, function(err, result) {
        if (err) {
          console.log(err);
          if (err.message) {
            growl.error(err.message, {ttl: -1});
          } else {
            growl.error('Save settings failed.');
          }
        } else {
          growl.success('Setting saved.');
          // if (result && result.dataDirectoryChanged) {
          //   growl.info('Data directory changed.');

          //   $timeout(function() {
          //     reloadStats();
          //   }, 500);
          // }
        }
      });
    }

    /*
    * WINDOW
    */

    $scope.minimize = function () {
    };

    $scope.close = function () {
    };

    // var shell = require('electron').shell;

    $scope.openFileExternal = function(file_path) {
      // console.log('openFileExternal: ' + file_path);
      // ipc.send('open-pdf-file', {path: file_path});
      // shell.openItem(file_path);
      $http.post('/open_file?path=' + encodeURIComponent(file_path))
        .then(function(response) {
          // this callback will be called asynchronously
          // when the response is available
          console.log(response);
        }, function(response) {
          console.log(response);
        });
    }

    $scope.openLocationExternal = function(file_path) {
      // console.log('openLocationExternal: ' + file_path);
      // ipc.send('open-location', {path: file_path});
      // shell.showItemInFolder(file_path);
      $http.post('/open_location?path=' + encodeURIComponent(file_path))
        .then(function(response) {
          // this callback will be called asynchronously
          // when the response is available
          console.log(response);
        }, function(response) {
          console.log(response);
        });
    }

    /*
    * STARTUP
    */

    function reloadStats() {
      $scope.getCounts({
        folders_count: true,
        collections_count: true,
        photos_count: true,
        favorites_count: true
      });
      // $scope.loadTagStats();
      $scope.loadDateStats({
        sort: '-date',
        // scope: 'year',
        limit: 2000
      });
    }

    function start() {
      loadSettings();
      reloadStats();
      setInterval(reloadStats, 60000); // 60 seconds

      if ($scope.activeSection == 'folders') {
        $scope.loadFolders();
      } else if ($scope.activeSection == 'collections') {
        $scope.loadCollections();  
      } else if ($scope.activeSection == 'favorites') {
        $scope.loadFavoritePhotos();  
      } else {
        $scope.loadPhotos();
      }
    }

    start();

  }]);