import { predefinedCategories } from '../data/categories.js';
import { readUserData, withUserTransaction } from './store.js';
import { AppError, notFound } from './errors.js';

export function categoryRows(state, type) {
  return [...predefinedCategories, ...state.rows('categories')]
    .filter(category => !type || category.type === type)
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function listCategories(userId, type) {
  return categoryRows(await readUserData(userId, ['categories']), type);
}

export function findCategory(state, categoryId) {
  return predefinedCategories.find(category => category.id === categoryId) || state.get('categories', categoryId);
}

export function validateCategory(state, categoryId, type) {
  const category = findCategory(state, categoryId);
  if (!category) throw new AppError(422, 'INVALID_CATEGORY', 'Choose one of your available categories.');
  if (category.type !== type) throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', `Choose an ${type.toLowerCase()} category.`);
  return category;
}

function ownedCategory(state, categoryId) {
  const category = findCategory(state, categoryId);
  if (!category) throw notFound('Category');
  if (category.user_id === null) throw new AppError(403, 'SHARED_CATEGORY', 'Predefined categories cannot be changed.');
  return category;
}

function assertUnique(state, input, excludedId) {
  const normalize = value => value.normalize('NFKC').toLowerCase();
  if (categoryRows(state).some(category => category.id !== excludedId && category.type === input.type && normalize(category.name) === normalize(input.name))) {
    throw new AppError(409, 'DUPLICATE_CATEGORY', 'A category with this name and type already exists.');
  }
}

function inUse(state, id) {
  return ['transactions', 'budgets'].some(collection => state.rows(collection).some(row => row.category_id === id));
}

export function createCategory(userId, input) {
  return withUserTransaction(userId, state => {
    assertUnique(state, input);
    return state.set('categories', { id: state.newId('categories'), user_id: userId, ...input, created_at: state.now });
  });
}

export function updateCategory(userId, categoryId, input) {
  return withUserTransaction(userId, state => {
    const old = ownedCategory(state, categoryId);
    assertUnique(state, input, categoryId);
    if (old.type !== input.type && inUse(state, categoryId)) throw new AppError(409, 'CATEGORY_IN_USE', 'The type of a category in use cannot be changed.');
    return state.set('categories', { ...old, ...input });
  });
}

export function deleteCategory(userId, categoryId) {
  return withUserTransaction(userId, state => {
    ownedCategory(state, categoryId);
    if (inUse(state, categoryId)) throw new AppError(409, 'CATEGORY_IN_USE', 'This category is in use and cannot be deleted.');
    state.delete('categories', categoryId);
  });
}
