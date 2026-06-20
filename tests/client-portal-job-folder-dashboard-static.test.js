const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');

assert(
  portal.includes('id="portalJobDashboard"'),
  'Client portal should include a focused job folder dashboard region'
);

assert(
  portal.includes('function openPortalJobFolderDashboard('),
  'Job folder list items should open a focused folder dashboard'
);

assert(
  portal.includes('function closePortalJobFolderDashboard('),
  'Focused job folder dashboard should provide a way back to all documents'
);

assert(
  portal.includes('function editPortalJobFolder('),
  'Admin view should allow editing an existing job folder'
);

assert(
  /portal-job-folder-item[^;]+onclick="openPortalJobFolderDashboard/.test(portal),
  'Rendered job folder items should be clickable'
);

assert(
  portal.includes('portalJobFolderMode') && portal.includes('portalJobFolderId'),
  'Job folder modal should track create vs edit state'
);

assert(
  portal.includes('portalJobFolderPhotoList') && portal.includes('portalJobFolderFileList'),
  'Job folder dashboard should expose photos and files sections'
);

assert(
  portal.includes('id="portalJobFolderSearch"') &&
    portal.includes('oninput="renderPortalJobFolderDocumentOptions()"'),
  'Job folder modal should let admins search documents while selecting them'
);

assert(
  portal.includes('function portalJobFolderSearchText(') &&
    portal.includes('function renderPortalJobFolderDocumentOptions('),
  'Job folder document selector should filter via a dedicated render helper'
);

assert(
  portal.includes('No documents match this search'),
  'Job folder document search should show an empty-state message when nothing matches'
);

assert(
  portal.includes('portal_job_folders') && portal.includes('assets'),
  'Saved folder metadata should include room for future photos/files/notes'
);
