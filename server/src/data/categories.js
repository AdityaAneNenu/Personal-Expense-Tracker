const namesByType = {
  EXPENSE: ['Food and groceries', 'Transport', 'Accommodation', 'Education', 'Healthcare', 'Shopping', 'Entertainment', 'Utilities', 'Other expenses'],
  INCOME: ['Salary', 'Stipend', 'Freelance income', 'Scholarship', 'Other income'],
};

// Stable IDs keep references intact. Append new categories instead of
// reordering these lists. Built-in categories need no database seeding.
export const predefinedCategories = Object.entries(namesByType).flatMap(([type, names]) => names.map((name, index) => ({
  id: `default-${type.toLowerCase()}-${index + 1}`, user_id: null, name, type, created_at: null,
})));
