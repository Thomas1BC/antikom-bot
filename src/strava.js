import axios from 'axios';

const STRAVA_BASE_URL = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth/token';

function createAxios(accessToken) {
  return axios.create({
    baseURL: STRAVA_BASE_URL,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const response = await axios.post(
    STRAVA_OAUTH_URL,
    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    },
    {
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

export async function getRecentActivities(accessToken, { after, perPage = 30 }) {
  const client = createAxios(accessToken);
  const response = await client.get('/athlete/activities', {
    params: {
      after,
      page: 1,
      per_page: perPage
    }
  });
  return response.data;
}

export async function getActivity(accessToken, activityId) {
  const client = createAxios(accessToken);
  const response = await client.get(`/activities/${activityId}`, {
    params: {
      include_all_efforts: true
    }
  });
  return response.data;
}

export async function getSegment(accessToken, segmentId) {
  const client = createAxios(accessToken);
  const response = await client.get(`/segments/${segmentId}`);
  return response.data;
}

export async function updateActivity(accessToken, activityId, description) {
  const client = createAxios(accessToken);
  const response = await client.put(`/activities/${activityId}`, {
    description
  });
  return response.data;
}
