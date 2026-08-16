// src/api/favorites.js
// Favoritos sincronizados (referencian frequency_id del backend).
// Los favoritos locales (ids de perfil, ob-favs-v1) NO se reemplazan: este
// módulo es la capa remota opcional.

import { get, post, del } from './client.js';

export const listFavorites = () => get('/api/v1/favorites');
export const addFavorite = (frequencyId) => post(`/api/v1/favorites/${frequencyId}`);
export const removeFavorite = (frequencyId) => del(`/api/v1/favorites/${frequencyId}`);
