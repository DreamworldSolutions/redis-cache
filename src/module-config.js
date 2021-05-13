import config from 'config';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Loads module's configuration considering module-defaults, module configuraiton provided
 * by the app in it's configuration files and the environment variables of the module.
 * 
 * Note: Module's environment variable will override the command-line argument in this case
 * but that's fine, as we aren't using it.
 */
const getModuleConfig = (moduleRootDir, moduleName) => {
  const options = { skipConfigSources: true };

  const baseConfigDir = path.join(moduleRootDir, 'config');
  const baseConfig = config.util.cloneDeep(config.util.loadFileConfigs(baseConfigDir, options));
  // config.util.setModuleDefaults(moduleName, baseConfig);

  let appConfig;
  try {
    appConfig = config.util.cloneDeep(config.get(moduleName));
  } catch (err) {
    appConfig = {};
  }

  let config = config.util.extendDeep(baseConfig, appConfig);

  const envConfigDir = path.join(moduleRootDir, 'config-env');
  const envConfig = config.util.loadFileConfigs(envConfigDir, options);

  return config.util.extendDeep(config, envConfig);
}

const esModuleDirName = path.dirname(fileURLToPath(import.meta.url));
const moduleRootDir = path.join(esModuleDirName, '..');
const moduleConfig = getModuleConfig(moduleRootDir, 'redisCache');

export default moduleConfig;