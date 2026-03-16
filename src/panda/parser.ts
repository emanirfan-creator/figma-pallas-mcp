export function parseRecipeToFigmaSchema(recipe: any): any {
  // Convert Panda recipe object (variants, slots) into Figma properties schema
  // E.g., variant 'size': ['sm', 'md'] -> Figma VARIANT property 'size' with options 'sm', 'md'
  const schema: any = {
    properties: {},
    variantCombinations: []
  };

  if (recipe.variants) {
    for (const [key, variants] of Object.entries(recipe.variants)) {
      schema.properties[key] = {
        type: 'VARIANT',
        options: Object.keys(variants as object),
        defaultValue: recipe.defaultVariants?.[key]
      };
    }
  }

  // TODO: Build Cartesian product of all variant options to list all required component frames
  // For now, return basic schema mapping
  return schema;
}
