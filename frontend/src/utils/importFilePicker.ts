import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Capacitor } from '@capacitor/core';

const CSV_MIME_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
];

const base64ToBlob = (value: string, mimeType: string): Blob => {
  const payload = value.includes(',') ? value.split(',', 2)[1] : value;
  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const createFileFromPickedPath = async (
  path: string,
  name: string,
  mimeType: string,
): Promise<File> => {
  const response = await fetch(path);
  const blob = await response.blob();
  return new File([blob], name, { type: mimeType || blob.type || 'text/csv' });
};

export const isNativeImportPicker = (): boolean => Capacitor.isNativePlatform();

export const pickImportCsvFile = async (): Promise<File | null> => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  if (Capacitor.getPlatform() === 'android') {
    const currentPermissions = await FilePicker.checkPermissions();
    if (currentPermissions.readExternalStorage !== 'granted') {
      const requestedPermissions = await FilePicker.requestPermissions({
        permissions: ['readExternalStorage'],
      });
      if (requestedPermissions.readExternalStorage !== 'granted') {
        throw new Error('permission_denied');
      }
    }
  }

  const result = await FilePicker.pickFiles({
    limit: 1,
    readData: true,
    types: CSV_MIME_TYPES,
  });

  const pickedFile = result.files[0];
  if (!pickedFile) {
    return null;
  }

  const fileName = pickedFile.name || 'transactions.csv';
  const mimeType = pickedFile.mimeType || 'text/csv';

  if (pickedFile.blob) {
    return new File([pickedFile.blob], fileName, { type: mimeType });
  }

  if (pickedFile.data) {
    return new File([base64ToBlob(pickedFile.data, mimeType)], fileName, {
      type: mimeType,
    });
  }

  if (pickedFile.path) {
    return createFileFromPickedPath(pickedFile.path, fileName, mimeType);
  }

  throw new Error('file_read_failed');
};
