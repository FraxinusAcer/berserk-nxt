import { is } from '@electron-toolkit/utils';
import { join, basename, extname } from 'path';
import fs from 'fs-extra';
import os from 'os';
import AdmZip from 'adm-zip';

const resources_path = is.dev ? join(__dirname, '../../resources') : join(process.resourcesPath, 'app.asar.unpacked', 'resources');

export function installAddon(zipPath) {
  try {
    const extractPath = join(os.tmpdir(), basename(zipPath, extname(zipPath)))
    fs.ensureDirSync(extractPath)

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractPath, true)

    const baseName = basename(zipPath, extname(zipPath));
    const addonFileName = `addon-${baseName.replace('addon-','')}.json`;

    fs.copySync(join(extractPath, 'addon.json'), join(resources_path, addonFileName), { overwrite: true })

    const targetPath = join(resources_path, 'cards')
    fs.ensureDirSync(targetPath)
    fs.copySync(join(extractPath, 'cards'), targetPath, { overwrite: true })

    fs.rmdirSync(extractPath, { recursive: true })
    return true
  } catch (error) {
    console.error('Failed to install addon:', error)
    return false
  }
}

export function deinstallAddon(name) {
  const data_addon = JSON.parse(fs.readFileSync(join(resources_path, name), 'utf8'))
  fs.removeSync(join(resources_path, name))
  Object.keys(data_addon['const']['sets'] || {}).forEach((set_name) => {
    fs.rmdirSync(join(resources_path, 'cards', set_name), { recursive: true })
  })
  return true
}
