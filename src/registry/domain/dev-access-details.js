'use strict';

module.exports = (conf, cdn) => {
  const filePath = () => {
    const d = new Date();
    // Expected fileNameSuffix is `YEAR_QUARTER` e.g 2018-01 for duration Jan 2018 to Mar 2018
    const fileNameSuffix = `${d.getUTCFullYear()}_0${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const fileName = `update-${fileNameSuffix}.log`;
    return `${conf.s3.componentsDir}/${fileName}`;
  };
  const getFile = callback => cdn.getFile(filePath(), true, callback);

  const save = (data, callback) =>
    cdn.putFileContent(data, filePath(), true, callback);

  const log = (logMessage, callback) => {
    getFile((getFileErr, details) => {
      console.info("getFileErr: ", getFileErr);
      console.info("Hello: ", JSON.stringify(getFileErr));
      let newFileContent = '';
      if (getFileErr) {
        if (getFileErr.code === 'file_not_found') {
          newFileContent = `${logMessage}`;
        } else {
          callback(getFileErr);
          return;
        }
      } else {
        newFileContent = `${details}\n${logMessage}`;
      }
      save(newFileContent, saveErr => {
        if (saveErr) {
          callback(saveErr);
          return;
        }
        callback(null, true);
      });
    });
  };

  return {
    log
  };
};
