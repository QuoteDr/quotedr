import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicArtifactConfig } from '../config/public-artifact.mjs';
import {
  createArtifactManifest,
  listFiles,
  repositoryRoot,
  resolveInside
} from './public-artifact-lib.mjs';

export async function buildPublicArtifact() {
  const { files, manifestPath, outputDirectory } = publicArtifactConfig;
  if (new Set(files).size !== files.length) throw new Error('The public artifact allowlist contains duplicate paths.');

  const outputRoot = resolveInside(repositoryRoot, outputDirectory);
  if (path.dirname(outputRoot) !== repositoryRoot || path.basename(outputRoot) !== 'dist') {
    throw new Error(`Refusing to clean unexpected output directory: ${outputRoot}`);
  }

  for (const file of files) {
    const source = resolveInside(repositoryRoot, file);
    const stat = await fs.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Allowlisted path is not a regular source file: ${file}`);
  }

  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  for (const file of files) {
    const source = resolveInside(repositoryRoot, file);
    const destination = resolveInside(outputRoot, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }

  const actualFiles = await listFiles(outputRoot);
  const expectedFiles = [...files].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('Built artifact does not exactly match the production allowlist.');
  }

  const manifest = await createArtifactManifest(outputRoot, expectedFiles);
  const manifestFile = resolveInside(repositoryRoot, manifestPath);
  await fs.mkdir(path.dirname(manifestFile), { recursive: true });
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, outputRoot };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const { manifest } = await buildPublicArtifact();
  console.log(`Built ${manifest.fileCount} allowlisted files (${manifest.totalBytes} bytes) in dist/.`);
  console.log(`Candidate tree SHA-256: ${manifest.treeSha256}`);
}
