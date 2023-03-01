/**
 * details of a desired download
 * @property {string} descr - description of the download
 * @property {'file' | 'archive'} type - whether it is a single file or a ZIP archive
 * @property {string} save_to - subdirectory where it must be saved
 * @property {string} url - where it must be downloaded from
 */
type dl_data = {
    descr: string,
    type: 'file' | 'archive',
    save_to: string,
    url: string
};

