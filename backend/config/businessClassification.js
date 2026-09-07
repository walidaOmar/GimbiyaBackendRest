export const BUSINESS_SECTORS = ["retail", "wholesale", "manufacturing"];

const retailCategories = [
  ["Food & Grocery Retail", ["Supermarkets", "Hypermarkets", "Convenience Stores", "Specialty Grocery (Bakery, Butcher)", "Organic & Health Food Stores"]],
  ["Apparel & Clothing Retail", ["Men's Clothing Boutiques", "Women's Fashion Boutiques", "Children's Wear Stores", "Sportswear & Activewear Retailers", "Bridal & Formal Wear Shops"]],
  ["Footwear & Accessories", ["Family Shoe Stores", "Luxury Footwear Boutiques", "Jewelry Stores", "Luggage & Leather Goods", "Watch Shops"]],
  ["Home & Furniture Retail", ["Furniture Showrooms", "Mattress Stores", "Home Decor Boutiques", "Lighting Shops", "Floor Covering Centers"]],
  ["Kitchen & Household Appliances", ["Major Appliance Retailers", "Small Kitchen Appliance Shops", "Cookware & Kitchenware Stores", "Smart Home Tech Retail", "Water Filtration Retailers"]],
  ["Electronics & Technology Retail", ["Consumer Electronics Chains", "Mobile Phone & Accessories Shops", "Computer Hardware Stores", "Audio & Hi-Fi Equipment Shops", "Camera & Photography Stores"]],
  ["Health, Beauty & Personal Care", ["Pharmacies & Drugstores", "Cosmetics & Beauty Boutiques", "Perfumeries", "Optical Goods Retailers", "Vitamin & Supplement Shops"]],
  ["Sports, Outdoors & Recreation", ["General Sporting Goods Stores", "Bicycle & Cycling Shops", "Camping & Outdoor Gear Outlets", "Fitness Equipment Retailers", "Hunting & Fishing Supply Shops"]],
  ["Hobby, Toys & Entertainment", ["Toy Stores", "Hobby & Craft Supply Shops", "Board Game & Comic Book Shops", "Musical Instrument Stores", "Video Game Retailers"]],
  ["Books, Stationery & Office Supplies", ["General Bookstores", "Academic & Medical Bookshops", "Stationery Shops", "Office Supply Retailers", "Art Supply Stores"]],
  ["Automotive & Marine Retail", ["Auto Parts Stores", "Tire & Battery Centers", "Car Dealerships (New/Used)", "Motorcycle & ATV Dealers", "Marine & Boating Supply Shops"]],
  ["Garden, Hardware & Building Supply", ["Hardware Stores", "Garden Centers & Nurseries", "Building Material Retailers", "Paint & Wallpaper Stores", "Lawn Mower & Outdoor Power Equipment Shops"]],
  ["Pet Supplies & Animals", ["Pet Supply Stores", "Aquarium & Fish Shops", "Pet Boutiques", "Feed & Farm Supply Stores", "Avian & Small Animal Specialty Shops"]],
  ["Jewelry, Gifts & Novelties", ["Fine Jewelry Retailers", "Gift & Souvenir Shops", "Duty-Free Shops", "Greeting Card Shops", "Party Supply Stores"]],
  ["Department, Discount & Variety", ["Traditional Department Stores", "Discount Department Stores", "Dollar & Variety Stores", "Warehouse Clubs", "Liquidators & Overstock Outlets"]],
];

const wholesaleCategories = [
  ["Bulk Food & Ingredient Distribution", ["Grains & Commodity Wholesalers", "Flour & Bakery Ingredient Suppliers", "Sugar & Sweetener Distributors", "Edible Oils Wholesalers", "Spices & Seasoning Distributors"]],
  ["Fresh Produce & Perishables Wholesaling", ["Fruit & Vegetable Wholesalers", "Meat & Poultry Distributors", "Seafood Wholesalers", "Dairy Product Distributors", "Frozen Food Wholesalers"]],
  ["Beverage Wholesaling", ["Soft Drink & Water Distributors", "Beer & Ale Wholesalers", "Wine & Spirits Distributors", "Coffee Bean Wholesalers", "Tea Brokers & Wholesalers"]],
  ["Apparel & Textile Wholesaling", ["Bulk Apparel Distributors", "Fabric & Textile Mills Wholesalers", "Footwear Wholesalers", "Yarn & Thread Wholesalers", "Uniform & Workwear Suppliers"]],
  ["Industrial Machinery & Equipment Wholesaling", ["Manufacturing Machinery Distributors", "Construction Equipment Wholesalers", "Agricultural Equipment Distributors", "Material Handling Equipment Suppliers", "Mining Machinery Distributors"]],
  ["Commercial & Office Equipment", ["Office Furniture Wholesalers", "Commercial Printer Distributors", "POS System Wholesalers", "ATM & Banking Equipment Distributors", "Store Fixture & Display Suppliers"]],
  ["Electrical & Electronic Component Wholesaling", ["Semiconductor Distributors", "Wiring & Cable Wholesalers", "Electronic Component Suppliers", "Industrial Automation Wholesalers", "Telecommunications Equipment Wholesalers"]],
  ["Building Materials & Construction Wholesale", ["Lumber & Wood Product Wholesalers", "Cement & Concrete Distributors", "Roofing & Siding Suppliers", "Insulation Material Wholesalers", "Glass & Glazing Material Suppliers"]],
  ["Plumbing, Heating & HVAC Wholesaling", ["Plumbing Fixture Wholesalers", "Pipe & Fitting Distributors", "HVAC Equipment Wholesalers", "Boiler & Furnace Suppliers", "Water Heater Distributors"]],
  ["Hardware & Tool Wholesaling", ["Hand Tool Wholesalers", "Power Tool Distributors", "Fastener & Bolt Wholesalers", "Industrial Lock & Security Suppliers", "Welding Supply Wholesalers"]],
  ["Chemical & Raw Material Wholesaling", ["Industrial Chemical Distributors", "Plastics & Resins Wholesalers", "Synthetic Rubber Distributors", "Agricultural Chemical Suppliers", "Dyes & Pigments Wholesalers"]],
  ["Medical, Dental & Biotech Wholesaling", ["Pharmaceutical Wholesalers", "Medical Device Distributors", "Dental Supply Wholesalers", "Surgical Instrument Suppliers", "Laboratory Equipment Wholesalers"]],
  ["Janitorial, Paper & Packaging Wholesale", ["Janitorial Supply Wholesalers", "Industrial Paper Product Distributors", "Packaging Material Suppliers", "Cardboard Box Wholesalers", "Commercial Cleaning Chemical Suppliers"]],
  ["Automotive Parts & Supplies Wholesale", ["OEM Auto Parts Wholesalers", "Aftermarket Parts Distributors", "Commercial Tire Wholesalers", "Automotive Lubricant Suppliers", "Body Shop Supply Wholesalers"]],
  ["Scrap, Waste & Recyclable Materials Wholesale", ["Scrap Metal Wholesalers", "Waste Paper Recyclers", "Plastic Scrap Distributors", "Electronic Waste Recyclers", "Textile Waste Wholesalers"]],
];

const manufacturingCategories = [
  ["Packaged Food Production", ["Canned & Preserved Food Manufacturing", "Dehydrated & Dried Food Plants", "Frozen Food Processing Plants", "Ready-to-Eat Meal Manufacturers", "Snack Food & Chip Factories"]],
  ["Grain & Oilseed Milling", ["Flour Milling Plants", "Rice Milling Facilities", "Malt Manufacturing Plants", "Wet Corn Milling", "Fats & Oils Refining Factories"]],
  ["Dairy Product Manufacturing", ["Fluid Milk Pasteurization Plants", "Cheese Manufacturing Facilities", "Butter & Ice Cream Factories", "Yogurt & Fermented Dairy Plants", "Dry & Condensed Milk Production"]],
  ["Meat & Poultry Processing", ["Slaughterhouses & Meat Packing Plants", "Poultry Processing Facilities", "Sausage & Processed Meat Plants", "Rendering Processing Facilities", "Seafood Processing & Canning"]],
  ["Beverage Manufacturing", ["Soft Drink & Carbonated Water Bottling", "Breweries & Ale Production", "Distilleries", "Wineries", "Juice Concentrating & Bottling"]],
  ["Textile Mills & Spinning", ["Yarn Spinning Mills", "Fabric Weaving Mills", "Knit Fabric Mills", "Textile Dyeing & Finishing Plants", "Carpet & Rug Mills"]],
  ["Apparel & Garment Manufacturing", ["Cut & Sew Apparel Factories", "Hosiery & Sock Mills", "Apparel Accessories Manufacturing", "Leather & Fur Apparel Plants", "Uniform & Workwear Factories"]],
  ["Wood Product Manufacturing", ["Sawmills & Planing Mills", "Plywood & Veneer Mills", "Truss & Structural Wood Component Plants", "Wood Container & Pallet Factories", "Prefabricated Wood Building Manufacturing"]],
  ["Paper, Pulp & Cardboard Manufacturing", ["Pulp Mills", "Paper & Paperboard Mills", "Corrugated Box Manufacturing Plants", "Sanitary Paper Product Factories", "Stationery & Envelope Manufacturers"]],
  ["Printing & Media Publishing Manufacturing", ["Commercial Lithographic Printing", "Digital & Flexographic Printing Plants", "Book Printing & Binding Facilities", "Screen Printing Factories", "Blank Media Manufacturing"]],
  ["Petroleum & Coal Product Refining", ["Petroleum Refineries", "Asphalt Paving Mixture Plants", "Asphalt Shingle Manufacturing", "Petroleum Lubricant Oil Plants", "Coal Product Manufacturing"]],
  ["Chemical & Compound Manufacturing", ["Industrial Gas Manufacturing", "Inorganic Chemical Production", "Synthetic Organic Chemical Plants", "Plastic Resin & Synthetic Fiber Plants", "Fertilizer & Agricultural Chemical Manufacturing"]],
  ["Pharmaceutical & Medicine Manufacturing", ["Medicinal & Botanical Manufacturing", "Pharmaceutical Pill & Capsule Plants", "In-Vitro Diagnostic Substance Makers", "Biologic Product (except Diagnostic) Labs", "Vaccine Manufacturing Plants"]],
  ["Plastics Product Fabrication", ["Plastics Pipe & Pipe Fitting Plants", "Plastics Profile Shape Extruders", "Laminated Plastics Plate & Sheet Production", "Polystyrene Foam Product Molding", "Plastics Bottle Manufacturing"]],
  ["Rubber Product Manufacturing", ["Tire Manufacturing Plants", "Tire Retreading Facilities", "Rubber Hose & Belting Factories", "Molded or Extruded Rubber Goods", "Rubber Seal & Gasket Production"]],
  ["Primary Metal Manufacturing", ["Iron & Steel Mills", "Steel Pipe & Tube Manufacturing", "Aluminum Smelting & Refining", "Nonferrous Metal Rolling & Drawing", "Foundries (Iron, Steel, Aluminum)"]],
  ["Fabricated Metal Product Manufacturing", ["Cutlery & Hand Tool Manufacturing", "Structural Metal Fabrication Shops", "Metal Tank & Vessel Manufacturers", "Hardware & Fastener Production Plants", "Spring & Wire Product Manufacturing"]],
  ["Machinery & Industrial Engine Manufacturing", ["Agricultural Machinery Production", "Construction Equipment Factories", "Mining Machinery Plants", "Industrial Gas Turbine & Engine Plants", "Material Handling Equipment Factories"]],
  ["Computer, Electronic & Semiconductor Manufacturing", ["Computer & Peripheral Manufacturing", "Communications Equipment Plants", "Audio & Video Equipment Factories", "Semiconductor & Microchip Fabrication", "Electronic Component Manufacturing"]],
  ["Electrical Equipment & Appliance Manufacturing", ["Electric Lamp & Bulb Factories", "Household Cooking Appliance Plants", "Household Refrigerator & Laundry Machine Factories", "Electrical Transformer Production", "Switchgear & Switchboard Apparatus Manufacturing"]],
];

const toCategories = (entries) => entries.map(([name, subcategories]) => ({ name, subcategories }));

export const BUSINESS_CLASSIFICATION = {
  retail: toCategories(retailCategories),
  wholesale: toCategories(wholesaleCategories),
  manufacturing: toCategories(manufacturingCategories),
};

export const BUSINESS_TYPES = ["manufacturer", "wholesaler", "retailer", "service_provider"];
export const MARKET_TIERS = ["consumer", "wholesale", "manufacturing"];

export const businessTypeForSector = (sector) => ({
  retail: "retailer",
  wholesale: "wholesaler",
  manufacturing: "manufacturer",
}[sector] || null);

export const marketTierForBusinessType = (businessType) => ({
  retailer: "consumer",
  wholesaler: "wholesale",
  manufacturer: "manufacturing",
}[businessType] || "consumer");

export const validateClassification = (businessSector, primaryCategory, secondarySubcategory) => {
  const categories = BUSINESS_CLASSIFICATION[businessSector];
  const category = categories?.find((item) => item.name === primaryCategory);
  const valid = Boolean(category && category.subcategories.includes(secondarySubcategory));

  return {
    valid,
    businessType: valid ? businessTypeForSector(businessSector) : null,
    marketTier: valid ? marketTierForBusinessType(businessTypeForSector(businessSector)) : null,
  };
};

export const classificationSummary = () => Object.fromEntries(
  Object.entries(BUSINESS_CLASSIFICATION).map(([sector, categories]) => [
    sector,
    categories.map(({ name, subcategories }) => ({ name, subcategories })),
  ])
);
