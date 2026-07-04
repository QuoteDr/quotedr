const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');
const invoiceViewer = fs.readFileSync('invoice-viewer.html', 'utf8');
const quoteViewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

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
  portal.includes('.portal-layout-client-os .portal-job-folders') &&
    !portal.includes('.portal-layout-client-os.admin-mode .portal-job-folders'),
  'Client OS job folders should be visible to clients when folders exist, not only in admin mode'
);

assert(
  portal.includes('portal-job-create-btn admin-only'),
  'Clients should not see job folder creation controls'
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
  portal.includes('portalJobFolderVideoList') &&
    portal.includes('portalJobVideoForm') &&
    portal.includes('Google Photos, Drive, YouTube, Vimeo, or Loom'),
  'Job folder dashboard should support video links instead of direct video uploads'
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

assert(
  portal.includes('id="portalJobPhotoUpload"') &&
    portal.includes('id="portalJobFileUpload"') &&
    portal.includes('uploadPortalJobAsset('),
  'Job folder assets should support real local photo/file uploads'
);

assert(
  portal.includes('compressPortalJobPhoto(') &&
    portal.includes('PORTAL_JOB_PHOTO_MAX_BYTES') &&
    portal.includes('PORTAL_JOB_FILE_MAX_BYTES'),
  'Photo uploads should be compressed and file uploads should enforce conservative size limits'
);

assert(
  portal.includes('PORTAL_JOB_FOLDER_SOFT_WARNING_BYTES') &&
    portal.includes('PORTAL_JOB_ACCOUNT_SOFT_WARNING_BYTES') &&
    portal.includes('PORTAL_JOB_ACCOUNT_HARD_LIMIT_BYTES'),
  'Job folder uploads should include folder and account storage guardrails'
);

assert(
  portal.includes('function portalJobFileIsVideo(') &&
    portal.includes('Video files are not stored in QuoteDr yet') &&
    portal.includes('Video link - hosted outside QuoteDr'),
  'Video files should be rejected while video links remain supported'
);

assert(
  portal.includes('loadPortalJobAssets(') &&
    portal.includes('getPortalJobAssetUrl(') &&
    portal.includes('togglePortalJobAssetVisibility('),
  'Job folder assets should load from storage metadata, use signed URLs, and support visibility toggles'
);

assert(
  portal.includes('Share PDF') &&
    portal.includes('function showPortalPdfShareModal(') &&
    portal.includes('function portalDocumentPdfHref('),
  'Client portal document cards should offer a safe Share PDF flow instead of sharing live action links'
);

assert(
  portal.includes('Shared PDFs cannot approve, reject, sign, or change payment status') &&
    portal.includes('print=1'),
  'Share PDF flow should explain the safer PDF behavior and open viewers in print/save mode'
);

assert(
  invoiceViewer.includes('function printInvoiceIfRequested(') &&
    invoiceViewer.includes("params.get('print') === '1'"),
  'Invoice viewer should support print=1 for portal PDF sharing'
);

assert(
  quoteViewer.includes('Download / Print PDF') &&
  quoteViewer.includes('function printQuoteIfRequested(') &&
  quoteViewer.includes("params.get('print') === '1'"),
  'Quote viewer should offer and support the same Download / Print PDF flow'
);
