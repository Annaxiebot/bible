import { useState, useRef } from 'react';

export function useDownloadState() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadStartTime, setDownloadStartTime] = useState(0);
  const [downloadTimeRemaining, setDownloadTimeRemaining] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [offlineChapters, setOfflineChapters] = useState<Set<string>>(new Set());
  const [autoDownloadInProgress, setAutoDownloadInProgress] = useState(false);
  const downloadCancelRef = useRef(false);

  return {
    isDownloading,
    setIsDownloading,
    downloadProgress,
    setDownloadProgress,
    downloadStatus,
    setDownloadStatus,
    downloadStartTime,
    setDownloadStartTime,
    downloadTimeRemaining,
    setDownloadTimeRemaining,
    isOffline,
    setIsOffline,
    showDownloadMenu,
    setShowDownloadMenu,
    offlineChapters,
    setOfflineChapters,
    autoDownloadInProgress,
    setAutoDownloadInProgress,
    downloadCancelRef,
  };
}
