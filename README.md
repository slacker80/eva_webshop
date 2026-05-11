# Eva Webshop

A simple e-commerce web application built with Express.js and vanilla JavaScript.

## Features

- Product catalog with categories
- Shopping cart functionality
- Responsive design
- RESTful API
- Real-time cart updates

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd eva_webshop
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

Or start the production server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Endpoints

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get a single product
- `GET /api/products/category/:category` - Get products by category

### Cart
- `GET /api/cart` - Get current cart
- `POST /api/cart` - Add item to cart
- `PUT /api/cart/:productId` - Update cart item quantity
- `DELETE /api/cart/:productId` - Remove item from cart
- `DELETE /api/cart` - Clear cart

## Project Structure

```
eva_webshop/
├── public/
│   └── index.html          # Frontend application
├── server.js               # Express server and API routes
├── package.json            # Project dependencies and scripts
├── .gitignore              # Git ignore file
└── README.md               # This file
```

## Technologies Used

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Data Storage**: In-memory (for demo purposes)

## Development

To run in development mode with auto-reload:
```bash
npm run dev
```

## Future Enhancements

- Database integration (MongoDB/PostgreSQL)
- User authentication
- Payment processing
- Product search
- Admin panel for product management
- Order history