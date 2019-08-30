// Cisco Starship Patch - START //

'use strict';

const async = require('async');
const _ = require('lodash');
const getUnixUTCTimestamp = require('oc-get-unix-utc-timestamp');
const strings = require('../../resources');

const eventsHandler = require('./events-handler');

module.exports = (conf, cdn) => {
  const returnError = (code, message, callback) => {
    eventsHandler.fire('error', { code, message });
    return callback(code);
  };

  const filePath = () => `${conf.s3.componentsDir}/active-components-details.json`;

  const getFromJson = callback => cdn.getJson(filePath(), true, callback);

  const getFromDirectories = (options, callback) => {
    const details = _.extend({}, _.cloneDeep(options.details));
    details.components = details.components || {};

    async.eachOfSeries(
      options.scopeList.componentsList.components,
      (versions, name, done) => {
        details.components[name] = details.components[name] || {};

        async.eachLimit(
          versions,
          cdn.maxConcurrentRequests,
          (version, next) => {
            if (details.components[name][version]) {
              next();
            } else {
              cdn.getJson(
                `${conf.s3.componentsDir}/${name}/${version}/package.json`,
                true,
                (err, content) => {
                  if (err) {
                    return next(err);
                  }
                  details.components[name][version] = {
                    publishDate: content.oc.date || 0
                  };
                  next();
                }
              );
            }
          },
          done
        );
      },
      err => callback(err, {
          lastEdit: getUnixUTCTimestamp(),
          components: details.components
        })
    );
  };

  const save = (data, callback) => cdn.putFileContent(JSON.stringify(data), filePath(), true, callback);

  const activateComponent = (data, callback) => {
    try {
      const jsonStrData = JSON.stringify(data);
      const componentsData = JSON.parse(jsonStrData);
      const desiredScope = componentsData.scope;
      const components = componentsData.components;

      getFromJson((jsonErr, details) => {
        if (jsonErr) {
          return callback(jsonErr);
        }
        const activeDetails = details;
        if (!activeDetails.activeVersions[desiredScope]) {
          activeDetails.activeVersions[desiredScope] = {};
        }
        _.forEach(components, (component, i) => {
          activeDetails.activeVersions[desiredScope][component.name] = component.version;
        });
        // activeDetails.activeVersions[scope][componentName] = componentVersion;
        const sortedActiveVersions = Object.create(null);
        const nonDefaultEndPointScopes = /^(imc-.*|hx-.*|ucsm-.*|ucsd-.*)$/i;
        Object.keys(activeDetails.activeVersions).sort((a, b) => {
          console.info('Inside the custom compare of scopes - a:', a, 'b:', b);
          if (a === 'default') {
            return -1;
          } else if (a === 'default-canary') {
            return -1;
          } else if (nonDefaultEndPointScopes.test(a) && !nonDefaultEndPointScopes.test(b)) {
            return -1;
          } else if (!nonDefaultEndPointScopes.test(a) && nonDefaultEndPointScopes.test(b)) {
            return 1;
          } else {
            // Let's keep the non-default and non-endpoint packages in their chronological order of publish
            return 0;
            // return a.localeCompare(b);
          }
        }).forEach((scopeName) => {
          sortedActiveVersions[scopeName] = Object.create(null);
          Object.keys(activeDetails.activeVersions[scopeName]).sort().forEach((componentName) => {
            sortedActiveVersions[scopeName][componentName] = activeDetails.activeVersions[scopeName][componentName];
          });
        });

        const sortedActiveDetails = Object.create(null);
        sortedActiveDetails.activeVersions = sortedActiveVersions;
        save(sortedActiveDetails, (err, savedDetails) => {
          if (err) {
            console.log('Error while saving active versions');
            callback(err);
          } else {
            console.log('Active Versions saved successfully');
            callback(null, savedDetails);
          }
        });
      });
    } catch (e) {
      callback(e);
    }
  };

  const deleteScope = (scopeName, callback) => {
    try {
      getFromJson((jsonErr, activeDetails) => {
        if (jsonErr) {
          return callback(jsonErr);
        }
        if (
          activeDetails.activeVersions
          && activeDetails.activeVersions[scopeName]
        ) {
          delete activeDetails.activeVersions[scopeName];
        }
        save(activeDetails, (err, savedDetails) => {
          if (err) {
            console.log('Error while saving active versions');
            callback(err);
          } else {
            console.log('Active Versions saved successfully');
            callback(null, savedDetails);
          }
        });
      });
    } catch (e) {
      callback(e);
    }
  };

  const getActiveComponentVersion = (scope, componentName, callback) => {
    let activeVersion;
    getFromJson((jsonErr, details) => {
      if (jsonErr) {
        callback(jsonErr);
        return;
      }
      if (
        details.activeVersions[scope]
        && details.activeVersions[scope][componentName]
      ) {activeVersion = details.activeVersions[scope][componentName];}
      else activeVersion = details.activeVersions.default[componentName];
      callback(activeVersion);
    });
    return activeVersion;
  };

  const refresh = (componentsList, callback) => {
    getFromJson((jsonErr, details) => {
      getFromDirectories({ componentsList, details }, (dirErr, dirDetails) => {
        if (dirErr) {
          return returnError('components_details_get', dirErr, callback);
        } else if (
          jsonErr ||
          !_.isEqual(dirDetails.components, details.components)
        ) {
          save(dirDetails, saveErr => {
            if (saveErr) {
              return returnError('components_details_save', saveErr, callback);
            }

            callback(null, dirDetails);
          });
        } else {
          callback(null, details);
        }
      });
    });
  };

  // const activeComponents = '{ "activeVersions": {"default": {"an-shell":"1.0.1-333","an-dejavu":"1.0.1-333","an-barracuda":"1.0.1-13322" },"latest": {"an-shell":"1.0.1-335","an-dejavu":"1.0.1-335","an-barracuda":"1.0.1-13325"},"sokathav": {"an-shell":"1.0.1-335","an-dejavu":"1.0.1-335","an-barracuda":"1.0.1-13322" },"i18n_beta": {}}}';
  const activeComponents = '{ "activeVersions": {"default": {}}}';

  const load = (componentsList, callback) => {
    getFromJson((jsonErr, details) => {
      if (jsonErr && jsonErr.code == strings.errors.s3.FILE_NOT_FOUND_CODE) {
        save(JSON.parse(activeComponents), (saveErr) => {
          if (saveErr) {
            return returnError(
              'active_components_details_save',
              saveErr,
              callback
            );
          }
          callback(null, componentsList);
        });
      } else {
        callback(null, details);
      }
    });
  };

  return {
    get: getFromJson,
    load,
    activate: activateComponent,
    deleteScope,
    getActiveVersion: getActiveComponentVersion,
    refresh
  };
};
// Cisco Starship Patch - END //
