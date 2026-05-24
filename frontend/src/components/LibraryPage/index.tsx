import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchDocuments, uploadDocument, uploadDocumentUrl, deleteDocument } from '../../api';
import type { Document } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Sun, Moon, LogOut, Plus, FileText, Link as LinkIcon, X, Trash2 } from 'lucide-react';

const POLLING_INTERVAL = 3000;

export function LibraryPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();

  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'pdf' | 'url'>('pdf');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [deleteCandidate, setDeleteCandidate] = useState<Document | null>(null);
  const [, setPendingDeletions] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDeletionsRef = useRef<Set<string>>(new Set());

  const handleDelete = async (docId: string) => {
    setPendingDeletions(prev => {
      const next = new Set(prev);
      next.add(docId);
      pendingDeletionsRef.current = next;
      return next;
    });

    setDocuments(prev => prev.filter(d => d.id !== docId));
    setDeleteCandidate(null);

    try {
      await deleteDocument(docId);
      setPendingDeletions(prev => {
        const next = new Set(prev);
        next.delete(docId);
        pendingDeletionsRef.current = next;
        return next;
      });
    } catch (err) {
      console.error(err);
      setPendingDeletions(prev => {
        const next = new Set(prev);
        next.delete(docId);
        pendingDeletionsRef.current = next;
        return next;
      });
      await loadDocs();
      setDeleteError('Failed to delete document');
    }
  };

  const loadDocs = async () => {
    try {
      const res = await fetchDocuments();
      setDocuments(res.data.filter(d => !pendingDeletionsRef.current.has(d.id)));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDocs().then(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (deleteError) {
      const timer = setTimeout(() => {
        setDeleteError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteError]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteCandidate(null);
      }
    };
    if (deleteCandidate) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteCandidate]);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing' || d.status === 'pending');
    if (hasProcessing) {
      const interval = setInterval(loadDocs, POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [documents]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      if (tab === 'pdf' && file) {
        await uploadDocument(file, title || undefined);
      } else if (tab === 'url' && url) {
        await uploadDocumentUrl(url, title || undefined);
      }
      setShowModal(false);
      setTitle('');
      setUrl('');
      setFile(null);
      await loadDocs();
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="reader-page">
      <header className="top-nav">
        <div className="logo">Pages Library</div>
        <div style={{ flex: 1 }} />
        
        <button className="primary-btn" style={{ width: 'auto', padding: '0.4rem 1rem', marginRight: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Document
        </button>
        
        <button className="control-btn" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="control-btn" onClick={signOut} style={{ marginLeft: '0.5rem' }} title="Sign Out">
          <LogOut size={20} />
        </button>
      </header>

      <main className="library-main">
        <div className="library-container">
          {deleteError && (
            <div 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: theme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#fee2e2',
                border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.4)' : '1px solid #fca5a5',
                color: theme === 'dark' ? '#fca5a5' : '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: '4px',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.9rem',
                marginBottom: '1rem',
              }}
            >
              <span>{deleteError}</span>
              <button 
                onClick={() => setDeleteError(null)} 
                style={{ background: 'none', border: 'none', color: theme === 'dark' ? '#fca5a5' : '#991b1b', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {documents.map(doc => {
            const progress = doc.total_chunks > 0 ? (doc.ready_chunks / doc.total_chunks) * 100 : 0;
            return (
              <div key={doc.id} className="doc-card" style={{ position: 'relative' }}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteCandidate(doc);
                  }}
                  className="doc-delete-btn"
                  title="Delete document"
                >
                  <Trash2 size={16} />
                </button>
                <div className="doc-header">
                  <span className="doc-badge">{doc.source_type.toUpperCase()}</span>
                  <span className="doc-status">{doc.status}</span>
                </div>
                <h3 className="doc-title-large">{doc.title}</h3>
                
                <div className="doc-progress">
                  <div className="progress-text">
                    <span>{doc.ready_chunks} / {doc.total_chunks} chunks ready</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <Link to={`/reader/${doc.id}`} className="primary-btn doc-action-btn">
                  {doc.ready_chunks > 0 ? 'Continue' : 'Open'}
                </Link>
              </div>
            );
          })}
          {documents.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
              No documents found. Add one to get started!
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="doc-card" style={{ width: '100%', maxWidth: '500px', background: 'var(--bg-surface)', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>Add Document</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <button onClick={() => setTab('pdf')} className={`primary-btn ${tab !== 'pdf' ? 'inactive' : ''}`} style={{ flex: 1, background: tab === 'pdf' ? 'var(--text-primary)' : 'var(--bg-surface)', color: tab === 'pdf' ? 'var(--bg-surface)' : 'var(--text-primary)' }}>
                <FileText size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} /> PDF
              </button>
              <button onClick={() => setTab('url')} className={`primary-btn ${tab !== 'url' ? 'inactive' : ''}`} style={{ flex: 1, background: tab === 'url' ? 'var(--text-primary)' : 'var(--bg-surface)', color: tab === 'url' ? 'var(--bg-surface)' : 'var(--text-primary)' }}>
                <LinkIcon size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} /> URL
              </button>
            </div>

            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tab === 'pdf' ? (
                <>
                  <input type="file" accept=".pdf" ref={fileInputRef} onChange={e => setFile(e.target.files?.[0] || null)} required style={{ color: 'var(--text-primary)' }} />
                </>
              ) : (
                <>
                  <input type="url" placeholder="https://example.com/article" value={url} onChange={e => setUrl(e.target.value)} required style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }} />
                </>
              )}
              <input type="text" placeholder="Title (Optional)" value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }} />
              
              <button type="submit" disabled={uploading || (tab === 'pdf' && !file) || (tab === 'url' && !url)} className="primary-btn" style={{ marginTop: '1rem' }}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="modal-overlay" onClick={() => setDeleteCandidate(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="doc-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-surface)', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>Delete document?</h2>
              <button onClick={() => setDeleteCandidate(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '2rem', color: 'var(--text-primary)' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 500, fontFamily: 'var(--font-serif)' }}>
                "{deleteCandidate.title}"
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                This cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setDeleteCandidate(null)} className="primary-btn" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteCandidate.id)} className="primary-btn danger-btn" style={{ flex: 1 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
