// Zoho-style "Account" categories for an item's Sales/Purchase Information
// (2026-09-17) — a plain organizing label for now, not a real ledger.
// BillItUp doesn't have a chart of accounts or a profit-and-loss report
// yet, so picking an account here doesn't change any invoice total or
// existing report; it's stored on the item so that grouping is already
// there if a real accounting report gets built later.
//
// The balance-sheet-style groups below (assets/liabilities) show up on both
// the Sales and Purchase side, same as they do in Zoho's own item form — a
// business can, for example, record a sale against "Unearned Revenue"
// (an advance) just as easily as against "Sales" itself.

const ASSET_AND_LIABILITY_GROUPS = [
  {
    group: "Other Current Asset",
    items: ["Other Current Asset", "Advance Tax", "Employee Advance", "Prepaid Expenses", "TDS Receivable"],
  },
  {
    group: "Fixed Asset",
    items: ["Fixed Asset", "Furniture and Equipment"],
  },
  {
    group: "Other Current Liability",
    items: ["Other Current Liability", "Employee Reimbursements", "Opening Balance Adjustments", "Tax Payable", "TDS Payable", "Unearned Revenue"],
  },
];

const INCOME_GROUP = {
  group: "Income",
  items: ["Income", "Discount", "General Income", "Interest Income", "Late Fee Income", "Other Charges", "Sales", "Shipping Charge"],
};

const EXPENSE_GROUP = {
  group: "Expense",
  items: [
    "Expense", "Advertising And Marketing", "Automobile Expense", "Bad Debt", "Bank Fees and Charges",
    "Consultant Expense", "Contract Assets", "Credit Card Charges", "Depreciation And Amortisation",
    "Depreciation Expense", "IT and Internet Expenses", "Janitorial Expense", "Lodging",
    "Meals and Entertainment", "Merchandise", "Office Supplies", "Other Expenses", "Postage",
    "Printing and Stationery", "Purchase Discounts", "Raw Materials And Consumables", "Referral Commission",
    "Rent Expense", "Repairs and Maintenance", "Salaries and Employee Wages", "Telephone Expense",
    "Transportation Expense", "Travel Expense", "Uncategorized",
  ],
};

const COST_OF_GOODS_SOLD_GROUP = {
  group: "Cost of Goods Sold",
  items: ["Cost of Goods Sold", "Job Costing", "Labor", "Materials", "Subcontractor"],
};

export const SALES_ACCOUNT_GROUPS = [...ASSET_AND_LIABILITY_GROUPS, INCOME_GROUP];
export const PURCHASE_ACCOUNT_GROUPS = [...ASSET_AND_LIABILITY_GROUPS, EXPENSE_GROUP, COST_OF_GOODS_SOLD_GROUP];
