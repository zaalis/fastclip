/**
 * Typed API client.
 *
 * Every call is same-origin with `credentials: 'include'`, so the session
 * travels in the HttpOnly cookie. No token ever touches JavaScript, and no API
 * key is ever persisted on this side of the wire.
 */

export class ApiError extends Error {
  status: number
  retryAfter?: number

  constructor(status: number, message: string, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

const GENERIC_ERROR =
  'Le serveur est injoignable. Vérifie que le back-end Fastclip est bien lance.'

async function parseError(response: Response): Promise<ApiError> {
  let message = `Erreur ${response.status}.`
  try {
    const data = await response.json()
    if (typeof data?.detail === 'string') message = data.detail
    else if (Array.isArray(data?.detail) && data.detail[0]?.msg)
      message = data.detail[0].msg
  } catch {
    /* body was not JSON: keep the generic message */
  }
  const retryAfter = Number(response.headers.get('Retry-After')) || undefined
  return new ApiError(response.status, message, retryAfter)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, GENERIC_ERROR)
  }

  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined })

// --- Types ------------------------------------------------------------------

export type ProjectStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'analyzing'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface User {
  id: string
  email: string
  username: string
  avatar_url: string | null
  created_at: string
  seconds_saved: number
}

export interface ScoreBreakdown {
  densite?: number
  rythme?: number
  format?: number
  autonomie?: number
}

export interface Suggestion {
  id: string
  project_id: string
  rank: number
  start_seconds: number
  end_seconds: number
  duration_seconds: number
  score: number
  category: string
  title: string
  hook: string
  reason: string
  suggested_caption: string
  hashtags: string[]
  score_breakdown: ScoreBreakdown
  source: 'mistral' | 'heuristic'
}

export interface Clip {
  id: string
  project_id: string
  suggestion_id: string | null
  title: string
  caption: string
  hashtags: string[]
  start_seconds: number
  end_seconds: number
  duration_seconds: number
  subtitle_style: string
  subtitle_size: string
  subtitle_position: string
  subtitle_accent: string
  subtitles_enabled: boolean
  export_format: string
  export_width: number
  export_height: number
  subtitle_font: string
  subtitle_effect: string
  playback_speed: number
  crop_x: number
  crop_y: number
  crop_zoom: number
  crop_rotation: number
  status: ProjectStatus
  progress: number
  stage_detail: string | null
  error_message: string | null
  output_size_bytes: number
  has_output: boolean
  has_subtitles_file: boolean
  video_url: string | null
  download_url: string | null
  srt_url: string | null
  created_at: string
  completed_at: string | null
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  progress: number
  stage_detail: string | null
  error_message: string | null
  analysis_source: 'mistral' | 'heuristic' | null
  analysis_error: string | null
  original_filename: string | null
  duration_seconds: number
  size_bytes: number
  width: number
  height: number
  language: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  files_purged: boolean
  thumbnail_url: string | null
  video_url: string | null
  clip_count: number
  suggestion_count: number
  suggestions?: Suggestion[]
  clips?: Clip[]
}

export interface TranscriptWord {
  start: number
  end: number
  word: string
}
export interface TranscriptSegment {
  id: number
  start: number
  end: number
  text: string
  words: TranscriptWord[]
}
export interface Transcript {
  language: string
  language_probability: number
  duration: number
  text: string
  segments: TranscriptSegment[]
}

export interface QueueItem {
  job_id: string
  project_id: string
  project_name: string
  clip_id: string | null
  kind: 'process' | 'export'
  status: 'queued' | 'running'
  stage: string
  stage_detail: string | null
  progress: number
  position: number
  created_at: string
}
export interface QueueSnapshot {
  active_slots: number
  pending_total: number
  items: QueueItem[]
}

export interface SystemStatus {
  app: string
  ai: {
    configured: boolean
    model: string | null
    heuristic_fallback: boolean
    message: string | null
  }
  transcription: {
    available: boolean
    model: string
    device: string
    compute_type: string
    loaded: boolean
  }
  ffmpeg: { available: boolean; version: string }
  limits: {
    max_upload_mb: number
    max_duration_seconds: number
    max_storage_per_user_mb: number
    retention_hours: number
    allowed_extensions: string[]
    export: { width: number; height: number; codec: string }
    concurrent_jobs: number
  }
  subtitles: { styles: string[]; sizes: string[]; positions: string[] }
}

export interface DashboardData {
  stats: {
    projects: number
    clips_exported: number
    seconds_saved: number
    storage_bytes: number
    storage_limit_bytes: number
  }
  recent_projects: Project[]
  queue: QueueSnapshot
}

export interface CaptionTemplate {
  id: string
  name: string
  style: string
  size: string
  position: string
  accent_color: string
  is_default: boolean
  created_at: string
}

export interface PrivacyData {
  account: User
  counts: { projects: number; clips: number; active_files: number }
  storage_bytes: number
  storage_limit_bytes: number
  retention_hours: number
  policy: { title: string; detail: string }[]
}

export interface ApiKeyStatus {
  configured: boolean
  masked: string | null
  model: string | null
  available_models: string[]
  model_error?: string | null
  message?: string
}

// --- Endpoints --------------------------------------------------------------

export const api = {
  status: () => get<SystemStatus>('/api/status'),

  auth: {
    me: () => get<{ user: User | null }>('/api/auth/me'),
    login: (email: string, password: string, remember: boolean) =>
      post<{ user: User }>('/api/auth/login', { email, password, remember }),
    register: (
      email: string,
      username: string,
      password: string,
      remember: boolean,
    ) =>
      post<{ user: User }>('/api/auth/register', {
        email,
        username,
        password,
        remember,
      }),
    logout: () => post<{ ok: boolean }>('/api/auth/logout'),
    passwordReset: (email: string) =>
      post<{ ok: boolean; email_delivery_configured: boolean; message: string }>(
        '/api/auth/password-reset',
        { email },
      ),
  },

  account: {
    updateProfile: (payload: { username?: string; email?: string }) =>
      patch<{ user: User }>('/api/account/profile', payload),
    changePassword: (current_password: string, new_password: string) =>
      post<{ ok: boolean; message: string }>('/api/account/password', {
        current_password,
        new_password,
      }),
    apiKeyStatus: () => get<ApiKeyStatus>('/api/account/mistral-key'),
    saveApiKey: (api_key: string) =>
      post<ApiKeyStatus>('/api/account/mistral-key', { api_key }),
    updateApiModel: (model: string) =>
      patch<ApiKeyStatus>('/api/account/mistral-key/model', { model }),
    refreshApiModels: () => post<ApiKeyStatus>('/api/account/mistral-key/models/refresh'),
    deleteApiKey: () => del<ApiKeyStatus>('/api/account/mistral-key'),
    uploadAvatar: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<{ user: User }>('/api/account/avatar', {
        method: 'POST',
        body: form,
      })
    },
    deleteAvatar: () => del<{ user: User }>('/api/account/avatar'),
    privacy: () => get<PrivacyData>('/api/account/data'),
    deleteAccount: (password: string) =>
      del<{ ok: boolean }>('/api/account', { password }),
  },

  projects: {
    list: () => get<{ projects: Project[] }>('/api/projects'),
    get: (id: string) => get<{ project: Project }>(`/api/projects/${id}`),
    transcript: (id: string) =>
      get<{ transcript: Transcript | null }>(`/api/projects/${id}/transcript`),
    rename: (id: string, name: string) =>
      patch<{ project: Project }>(`/api/projects/${id}`, { name }),
    remove: (id: string) => del<{ ok: boolean }>(`/api/projects/${id}`),
    trash: () => get<{ projects: Project[] }>('/api/projects/trash'),
    restore: (id: string) => post<{ project: Project }>(`/api/projects/trash/${id}/restore`),
    permanentlyRemove: (id: string) => del<{ ok: boolean }>(`/api/projects/trash/${id}`),
    retry: (id: string) => post<{ project: Project }>(`/api/projects/${id}/retry`),
    cancel: (id: string) => post<{ project: Project }>(`/api/projects/${id}/cancel`),
    upload: (
      file: File,
      name: string,
      onProgress?: (percent: number) => void,
      signal?: AbortSignal,
    ) =>
      // XHR rather than fetch: upload progress is the whole point of this screen.
      new Promise<{ project: Project }>((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)
        form.append('name', name)

        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/projects/upload')
        xhr.withCredentials = true

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}')
            if (xhr.status >= 200 && xhr.status < 300) resolve(data)
            else
              reject(
                new ApiError(
                  xhr.status,
                  typeof data?.detail === 'string'
                    ? data.detail
                    : `Erreur ${xhr.status}.`,
                ),
              )
          } catch {
            reject(new ApiError(xhr.status, GENERIC_ERROR))
          }
        }
        xhr.onerror = () => reject(new ApiError(0, GENERIC_ERROR))
        xhr.onabort = () => reject(new ApiError(0, 'Import annulé.'))
        signal?.addEventListener('abort', () => xhr.abort())
        xhr.send(form)
      }),
  },

  clips: {
    create: (
      projectId: string,
      payload: {
        suggestion_id?: string | null
        start_seconds: number
        end_seconds: number
        title: string
        caption: string
        hashtags: string[]
        subtitle_style: string
        subtitle_size: string
        subtitle_position: string
        subtitle_accent: string
        subtitles_enabled: boolean
        export_format: string
        subtitle_font: string
        subtitle_effect: string
        playback_speed: number
        crop_x: number
        crop_y: number
        crop_zoom: number
        crop_rotation: number
      },
    ) => post<{ clip: Clip }>(`/api/projects/${projectId}/clips`, payload),
    get: (id: string) => get<{ clip: Clip }>(`/api/clips/${id}`),
    cancel: (id: string) => post<{ clip: Clip }>(`/api/clips/${id}/cancel`),
    retry: (id: string) => post<{ clip: Clip }>(`/api/clips/${id}/retry`),
    remove: (id: string) => del<{ ok: boolean }>(`/api/clips/${id}`),
  },

  templates: {
    list: () => get<{ templates: CaptionTemplate[] }>('/api/caption-templates'),
    create: (payload: {
      name: string
      style: string
      size: string
      position: string
      accent_color: string
      is_default: boolean
    }) => post<{ template: CaptionTemplate }>('/api/caption-templates', payload),
    setDefault: (id: string) =>
      post<{ template: CaptionTemplate }>(`/api/caption-templates/${id}/default`),
    remove: (id: string) => del<{ ok: boolean }>(`/api/caption-templates/${id}`),
  },

  dashboard: () => get<DashboardData>('/api/dashboard'),
  queue: () => get<QueueSnapshot>('/api/queue'),
}
