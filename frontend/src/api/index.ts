import type { Document, Chunk, Note, ApiResponse, CreateNotePayload, Chapter } from '../types';
import { apiRequest } from './client';
import * as mockApi from './mock';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

export const fetchDocuments = async (): Promise<ApiResponse<Document[]>> => {
  if (USE_MOCK) return mockApi.fetchDocuments();
  return apiRequest<Document[]>('GET', '/documents');
};

export const deleteDocument = async (docId: string): Promise<ApiResponse<null>> => {
  if (USE_MOCK) return mockApi.deleteDocument(docId);
  return apiRequest<null>('DELETE', `/documents/${docId}`);
};

export const fetchDocument = async (docId: string): Promise<ApiResponse<Document>> => {
  if (USE_MOCK) return mockApi.fetchDocument(docId);
  return apiRequest<Document>('GET', `/documents/${docId}`);
};

export const fetchChunks = async (docId: string): Promise<ApiResponse<Chunk[]>> => {
  if (USE_MOCK) return mockApi.fetchChunks(docId);
  return apiRequest<Chunk[]>('GET', `/documents/${docId}/chunks`);
};

export const fetchChapters = async (docId: string): Promise<ApiResponse<Chapter[]>> => {
  if (USE_MOCK) return mockApi.fetchChapters(docId);
  return apiRequest<Chapter[]>('GET', `/documents/${docId}/chapters`);
};

export const fetchNotes = async (docId: string): Promise<ApiResponse<Note[]>> => {
  if (USE_MOCK) return mockApi.fetchNotes(docId);
  return apiRequest<Note[]>('GET', `/documents/${docId}/notes`);
};

export const createNote = async (payload: CreateNotePayload): Promise<ApiResponse<Note>> => {
  if (USE_MOCK) return mockApi.createNote(payload);
  return apiRequest<Note>('POST', '/notes', payload);
};

export const deleteNote = async (noteId: string): Promise<ApiResponse<null>> => {
  if (USE_MOCK) return mockApi.deleteNote(noteId);
  return apiRequest<null>('DELETE', `/notes/${noteId}`);
};

export const uploadDocument = async (file: File, title?: string): Promise<ApiResponse<Document>> => {
  if (USE_MOCK) return mockApi.uploadDocument(file, title);
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  return apiRequest<Document>('POST', '/documents', formData, true);
};

export const uploadDocumentUrl = async (url: string, title?: string): Promise<ApiResponse<Document>> => {
  if (USE_MOCK) return mockApi.uploadDocumentUrl(url, title);
  return apiRequest<Document>('POST', '/documents', { url, title });
};

export const triggerTTS = async (docId: string, voiceId?: string): Promise<ApiResponse<unknown>> => {
  if (USE_MOCK) return mockApi.triggerTTS(docId, voiceId);
  return apiRequest<unknown>('POST', `/documents/${docId}/process-tts`, voiceId ? { voice_id: voiceId } : {});
};
