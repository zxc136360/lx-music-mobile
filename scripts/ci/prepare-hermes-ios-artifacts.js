'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const rootPath = path.resolve(__dirname, '..', '..')
const reactNativePackage = require(path.join(rootPath, 'node_modules/react-native/package.json'))
const reactNativeVersion = reactNativePackage.version
const hermesUtilsPath = path.join(rootPath, 'node_modules/react-native/sdks/hermes-engine/hermes-utils.rb')

const curlBaseArgs = [
  '--fail',
  '--location',
  '--silent',
  '--show-error',
  '--retry',
  '5',
  '--retry-delay',
  '5',
  '--retry-all-errors',
  '--connect-timeout',
  '20',
]

const artifactUrl = buildType => {
  return `https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${reactNativeVersion}/react-native-artifacts-${reactNativeVersion}-hermes-ios-${buildType}.tar.gz`
}

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootPath,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

for (const buildType of ['debug', 'release']) {
  const url = artifactUrl(buildType)
  console.log(`[Hermes] Checking ${buildType} iOS artifact: ${url}`)
  run('curl', [
    ...curlBaseArgs,
    '--max-time',
    '180',
    '--head',
    url,
    '--output',
    os.devNull,
  ])
}

let source = fs.readFileSync(hermesUtilsPath, 'utf8')

const replaceOnce = (label, oldText, newText) => {
  if (source.includes(newText)) return
  if (!source.includes(oldText)) {
    throw new Error(`[Hermes] Unable to patch ${label}; React Native hermes-utils.rb changed`)
  }
  source = source.replace(oldText, newText)
}

replaceOnce(
  'release artifact lookup',
  [
    'def release_artifact_exists(version)',
    '    return hermes_artifact_exists(release_tarball_url(version, :debug))',
    'end',
  ].join('\n'),
  [
    'def release_artifact_exists(version)',
    '    tarball_url = release_tarball_url(version, :debug)',
    '    exists = hermes_artifact_exists(tarball_url)',
    '    if !exists && ENV[\'CI\'] == \'true\'',
    '        abort "[Hermes] Expected release artifact is unavailable after retries: #{tarball_url}"',
    '    end',
    '    return exists',
    'end',
  ].join('\n'),
)

replaceOnce(
  'stable Hermes download',
  [
    '    unless File.exist?(destination_path)',
    "      # Download to a temporary file first so we don't cache incomplete downloads.",
    '      tmp_file = "#{artifacts_dir()}/hermes-ios.download"',
    '      `mkdir -p "#{artifacts_dir()}" && curl "#{tarball_url}" -Lo "#{tmp_file}" && mv "#{tmp_file}" "#{destination_path}"`',
    '    end',
  ].join('\n'),
  [
    '    unless File.exist?(destination_path)',
    "      # Download to a temporary file first so we don't cache incomplete downloads.",
    '      tmp_file = "#{artifacts_dir()}/hermes-ios.download"',
    '      command = "mkdir -p \\"#{artifacts_dir()}\\" && curl --fail --location --show-error --retry 5 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 300 \\"#{tarball_url}\\" -o \\"#{tmp_file}\\" && mv \\"#{tmp_file}\\" \\"#{destination_path}\\""',
    '      system(command) || abort("[Hermes] Failed to download Hermes artifact: #{tarball_url}")',
    '    end',
  ].join('\n'),
)

replaceOnce(
  'Hermes artifact HEAD check',
  [
    'def hermes_artifact_exists(tarball_url)',
    '    # -L is used to follow redirects, useful for the nightlies',
    '    # I also needed to wrap the url in quotes to avoid escaping & and ?.',
    '    return (`curl -o /dev/null --silent -Iw \'%{http_code}\' -L "#{tarball_url}"` == "200")',
    'end',
  ].join('\n'),
  [
    'def hermes_artifact_exists(tarball_url)',
    '    # -L is used to follow redirects, useful for the nightlies.',
    '    command = "curl -o /dev/null --silent --show-error --fail --retry 5 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 180 -Iw \'%{http_code}\' -L \\"#{tarball_url}\\""',
    '    response = `#{command}`',
    '    return response == "200"',
    'end',
  ].join('\n'),
)

fs.writeFileSync(hermesUtilsPath, source)

console.log('[Hermes] Prepared deterministic iOS artifact lookup for CocoaPods')
