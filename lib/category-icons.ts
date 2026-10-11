/**
 * Icons an admin can give a category (Admin → Categories). Keys match
 * im_categories.icon (migration 0020); CategoryChips maps each to its
 * glyph. The icon is decorative — the category's name is what is read out.
 */
export const CATEGORY_ICONS = [
  { key: "bag-shopping", label: "Bag" },
  { key: "shirt", label: "Shirt" },
  { key: "scissors", label: "Scissors" },
  { key: "bowl-food", label: "Food bowl" },
  { key: "mug-hot", label: "Hot drink" },
  { key: "gem", label: "Gem" },
  { key: "spa", label: "Leaf" },
  { key: "palette", label: "Palette" },
  { key: "book", label: "Book" },
  { key: "couch", label: "Furniture" },
  { key: "box-open", label: "Box" },
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICONS)[number]["key"];

export function isCategoryIcon(key: unknown): key is CategoryIconKey {
  return CATEGORY_ICONS.some((i) => i.key === key);
}
