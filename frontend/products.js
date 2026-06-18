const PRODUCT_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "mocktails", label: "Mocktails" },
  { id: "shakes", label: "Shakes" },
  { id: "coffee", label: "Coffee" },
  { id: "food", label: "Food" }
];

const MOCKY_PRODUCTS = [
  {
    id: "citrus-pop-mojito",
    name: "Citrus Pop Mojito",
    category: "mocktails",
    price: 149,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1582106245687-cbb466a9f07f?auto=format&fit=crop&w=700&q=80",
    description: "A bright lime and mint refresher finished with soda sparkle.",
    ingredients: ["Lime", "Mint", "Cane syrup", "Soda"],
    customizations: [
      { label: "Sugar", options: ["Regular", "Less", "No added"] },
      { label: "Ice", options: ["Normal", "Light", "Extra"] }
    ]
  },
  {
    id: "berry-blush-fizz",
    name: "Berry Blush Fizz",
    category: "mocktails",
    price: 179,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=700&q=80",
    description: "Strawberry and cranberry fizz with basil aroma.",
    ingredients: ["Strawberry", "Cranberry", "Basil", "Tonic"],
    customizations: [
      { label: "Topping", options: ["Basil", "Mint", "Berry pearls"] },
      { label: "Ice", options: ["Normal", "Light", "Extra"] }
    ]
  },
  {
    id: "blue-lagoon-pop",
    name: "Blue Lagoon Pop",
    category: "mocktails",
    price: 169,
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1560508180-03f285f67ded?auto=format&fit=crop&w=700&q=80",
    description: "Blue curacao, lemon fizz and a clean citrus finish.",
    ingredients: ["Blue curacao", "Lemon", "Soda", "Citrus salt"],
    customizations: [
      { label: "Sugar", options: ["Regular", "Less", "No added"] },
      { label: "Salt rim", options: ["Yes", "No"] }
    ]
  },
  {
    id: "tropical-sunset",
    name: "Tropical Sunset",
    category: "mocktails",
    price: 189,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1601924638867-3ec6a6b7c7ef?auto=format&fit=crop&w=700&q=80",
    description: "Pineapple, orange and passion fruit layered over crushed ice.",
    ingredients: ["Pineapple", "Orange", "Passion fruit", "Ice"],
    customizations: [
      { label: "Sugar", options: ["Regular", "Less", "No added"] },
      { label: "Ice", options: ["Crushed", "Light", "Extra"] }
    ]
  },
  {
    id: "mango-cloud-shake",
    name: "Mango Cloud Shake",
    category: "shakes",
    price: 189,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1622484211148-7facf70e70f9?auto=format&fit=crop&w=700&q=80",
    description: "Alphonso mango, vanilla and soft cream blended thick.",
    ingredients: ["Mango", "Vanilla", "Milk", "Cream"],
    customizations: [
      { label: "Milk", options: ["Dairy", "Oat", "Almond"] },
      { label: "Topping", options: ["Mango cubes", "Whipped cream", "None"] }
    ]
  },
  {
    id: "belgian-choco-shake",
    name: "Belgian Choco Shake",
    category: "shakes",
    price: 199,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=700&q=80",
    description: "Dark chocolate shake with chilled milk and cream whip.",
    ingredients: ["Chocolate", "Milk", "Cream", "Cocoa"],
    customizations: [
      { label: "Sweetness", options: ["Regular", "Less sweet", "Extra sweet"] },
      { label: "Add-on", options: ["None", "Brownie chunks", "Choco chips"] }
    ]
  },
  {
    id: "cold-coffee-float",
    name: "Cold Coffee Float",
    category: "coffee",
    price: 169,
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=80",
    description: "Chilled coffee with vanilla cream and a smooth cafe finish.",
    ingredients: ["Coffee", "Milk", "Vanilla", "Cream"],
    customizations: [
      { label: "Coffee", options: ["Regular", "Strong", "Extra strong"] },
      { label: "Milk", options: ["Dairy", "Oat", "Almond"] }
    ]
  },
  {
    id: "caramel-iced-latte",
    name: "Caramel Iced Latte",
    category: "coffee",
    price: 179,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=700&q=80",
    description: "Espresso, cold milk and caramel over ice.",
    ingredients: ["Espresso", "Milk", "Caramel", "Ice"],
    customizations: [
      { label: "Sweetness", options: ["Regular", "Less sweet", "Extra caramel"] },
      { label: "Ice", options: ["Normal", "Light", "Extra"] }
    ]
  },
  {
    id: "paneer-tikka-wrap",
    name: "Paneer Tikka Wrap",
    category: "food",
    price: 169,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=700&q=80",
    description: "Smoky paneer, crisp vegetables and house sauce.",
    ingredients: ["Paneer", "Vegetables", "Wrap", "House sauce"],
    customizations: [
      { label: "Spice", options: ["Medium", "Mild", "Hot"] },
      { label: "Side", options: ["Chips", "Salad", "Dip"] }
    ]
  },
  {
    id: "cheese-corn-toastie",
    name: "Cheese Corn Toastie",
    category: "food",
    price: 139,
    rating: 4.5,
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=700&q=80",
    description: "Grilled toastie with sweet corn, cheese and herbs.",
    ingredients: ["Bread", "Cheese", "Corn", "Herbs"],
    customizations: [
      { label: "Spice", options: ["Mild", "Medium", "Hot"] },
      { label: "Dip", options: ["Mint", "Mayo", "No dip"] }
    ]
  }
];

const ProductManager = {
  getAll() {
    return [...MOCKY_PRODUCTS];
  },

  getCategories() {
    return [...PRODUCT_CATEGORIES];
  },

  getById(productId) {
    return MOCKY_PRODUCTS.find((product) => product.id === productId);
  },

  search(query, category = "all") {
    const normalizedQuery = query.trim().toLowerCase();

    return MOCKY_PRODUCTS.filter((product) => {
      const productText = [
        product.name,
        product.category,
        product.description,
        ...product.ingredients
      ].join(" ").toLowerCase();
      const matchesCategory = category === "all" || product.category === category;
      return matchesCategory && productText.includes(normalizedQuery);
    });
  }
};
