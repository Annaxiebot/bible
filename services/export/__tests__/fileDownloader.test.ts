import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadFile } from '../fileDownloader';

describe('downloadFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a blob and triggers download', () => {
    const mockUrl = 'blob:test-url';
    const createObjectURL = vi.fn().mockReturnValue(mockUrl);
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as HTMLElement);
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as HTMLElement);

    downloadFile('test content', 'test.json', 'application/json');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(mockAnchor.download).toBe('test.json');
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);

    createElement.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});
