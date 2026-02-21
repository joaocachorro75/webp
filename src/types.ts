export interface Server {
  id: number;
  name: string;
  url: string;
}

export interface UserInfo {
  username: string;
  password?: string;
  message?: string;
  auth: number;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface XtreamResponse {
  user_info: UserInfo;
  server_info: {
    url: string;
    port: string;
    https_port: string;
    server_protocol: string;
    rtmp_port: string;
    timezone: string;
    timestamp_now: number;
    time_now: string;
  };
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface Stream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
  container_extension?: string;
  series_id?: number;
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image: string;
    plot: string;
    duration: string;
  };
}

export interface SeriesInfo {
  seasons: {
    [key: string]: Episode[];
  };
  info: {
    name: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    last_modified: string;
    rating: string;
    cover: string;
  };
}
