const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
export const currency = (value) => inr.format(Number(value) || 0);
export const compactCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
export const paymentLabel = (value = "") =>
  value === "UPI"
    ? "UPI"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function formatDate(value, options = {}) {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? day
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...options,
      }).format(date);
}
export function periodLabel(month, year) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2100-12-31"
  );
}
export function validAmount(value) {
  return (
    /^\d+(\.\d{1,2})?$/.test(String(value)) &&
    Number(value) > 0 &&
    Number(value) <= 9999999999.99
  );
}
export function validateTransaction(form) {
  const errors = {};
  if (!["INCOME", "EXPENSE"].includes(form.type))
    errors.type = "Choose income or expense.";
  if (!form.category_id) errors.category_id = "Choose a category.";
  if (!validAmount(form.amount))
    errors.amount = "Enter a positive amount with at most two decimal places.";
  if (!validDate(form.transaction_date))
    errors.transaction_date = "Enter a valid date between 2000 and 2100.";
  if (!form.payment_method) errors.payment_method = "Choose a payment method.";
  if (form.description?.length > 500)
    errors.description = "Use 500 characters or fewer.";
  return errors;
}
export function validateAuth(form, register = false) {
  const errors = {};
  if (
    register &&
    (!form.name?.trim() ||
      form.name.trim().length < 2 ||
      form.name.trim().length > 100)
  )
    errors.name = "Enter a name between 2 and 100 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || ""))
    errors.email = "Enter a valid email address.";
  if (
    !form.password ||
    (register &&
      (form.password.length < 8 ||
        form.password.length > 4096 ||
        !/[a-zA-Z]/.test(form.password) ||
        !/\d/.test(form.password)))
  )
    errors.password = register
      ? "Use 8 to 4096 characters, including a letter and a number."
      : "Enter your password.";
  if (register && form.confirm_password !== form.password)
    errors.confirm_password = "Passwords do not match.";
  return errors;
}
