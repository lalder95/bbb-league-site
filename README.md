
# BBB League Site

>This is a comprehensive web application for managing and displaying information about the BBB fantasy football league. Built with [Next.js](https://nextjs.org), it features custom admin tools, draft management, player contracts, free agency, and more.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Technologies Used](#technologies-used)
- [Contributing](#contributing)
- [License](#license)

---

## Project Overview

This project is a fantasy football league management site, providing:
- League news and analytics
- Draft management and mock drafts
- Player contract and salary cap tracking
- Free agency and trade tools
- Admin dashboard for user management
- Historical league data and Hall of Fame

## Features
- **Admin Panel:** Manage users and league data
- **Draft Tools:** Mock drafts, draft order, rookie salaries, and strategy tips
- **Team Management:** My Team page, player contracts, salary cap, and trades
- **League Analytics:** News ticker, analytics dashboard, and history
- **Media:** Upload and view league-related media
- **Authentication:** Secure login and password management
- **Responsive UI:** Built with Tailwind CSS and modern UI components

## Project Structure

```
bbb-league-site/
├── public/                # Static assets (images, PDFs, data)
│   ├── data/              # League data files
│   ├── leagueimages/      # Division images
│   ├── players/           # Player images
│   └── ...
├── scripts/               # Node.js scripts for data migration, password hashing, etc.
├── src/
│   ├── app/               # Next.js app directory (routing, pages, API)
│   │   ├── admin/         # Admin dashboard and user management
│   │   ├── analytics/     # League analytics
│   │   ├── api/           # API routes (auth, admin, news, etc.)
│   │   ├── draft/         # Draft tools and mock draft
│   │   ├── free-agency/   # Free agency management
│   │   ├── hall-of-fame/  # Hall of Fame page
│   │   ├── history/       # League history
│   │   ├── login/         # Authentication
│   │   ├── my-team/       # Team management
│   │   ├── offseason/     # Offseason tools
│   │   ├── player-contracts/ # Player contracts
│   │   ├── rules/         # League rules
│   │   ├── salary-cap/    # Salary cap management
│   │   └── trade/         # Trade tools
│   ├── components/        # Reusable React components
│   ├── data/              # User and league data
│   ├── lib/               # Helper libraries (auth, db, etc.)
│   ├── pages/             # (If used) Legacy Next.js pages
│   └── utils/             # Utility functions
├── package.json           # Project metadata and scripts
├── tailwind.config.mjs    # Tailwind CSS configuration
├── next.config.mjs        # Next.js configuration
├── eslint.config.mjs      # ESLint configuration
└── README.md              # Project documentation
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm, yarn, pnpm, or bun

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/bbb-league-site.git
   cd bbb-league-site
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

### Development
Start the development server:
```bash
npm run dev
# or yarn dev, pnpm dev, bun dev
```
Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Build
To build the app for production:
```bash
npm run build
```
The output will be in the `.next` directory.

### Deployment
Deploy easily on [Vercel](https://vercel.com/) or any platform supporting Next.js. See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying).

## Scripts

- `npm run dev` – Start development server
- `npm run build` – Build for production
- `npm run start` – Start production server
- Custom scripts in `scripts/` for data migration, password hashing, etc.

## Configuration

- **next.config.mjs** – Next.js configuration
- **tailwind.config.mjs** – Tailwind CSS setup
- **eslint.config.mjs** – Linting rules
- **public/data/** – League and user data
- **src/lib/** – Database and authentication helpers

## Technologies Used

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [MongoDB](https://www.mongodb.com/) (via `src/lib/mongodb.js`)
- [Vercel](https://vercel.com/) (deployment)
- [ESLint](https://eslint.org/)

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License.

BEARDOWN