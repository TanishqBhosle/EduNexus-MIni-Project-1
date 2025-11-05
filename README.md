# EduNexus - Mini Learning Management System

A comprehensive Learning Management System built with the MERN stack, featuring course management, video lectures, assignments, and real-time chat functionality.

## 🚀 Features

### Core Features
- **Authentication & Authorization**: JWT-based login/signup with role-based access (admin/instructor/student)
- **Course Management**: Create, edit, delete, and enroll in courses
- **Video Lectures**: Upload and stream video content using Cloudinary
- **Assignment System**: Upload assignments and submit solutions
- **Real-time Chat**: Live communication between students and instructors
- **Admin Panel**: Comprehensive management of users and content

### User Roles
- **Admin**: Manage users, courses, and platform content
- **Instructor**: Create courses, upload lectures, manage assignments
- **Student**: Enroll in courses, watch lectures, submit assignments

## 🛠️ Tech Stack

- **Frontend**: React.js, React Router, Context API, Axios
- **Backend**: Node.js, Express.js, MongoDB, JWT
- **Real-time**: Socket.io
- **File Storage**: Cloudinary
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (Frontend), Render (Backend)

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/edunexus-lms.git
cd edunexus-lms
```

2. Install dependencies:
```bash
npm run install-all
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in both `backend` and `frontend` directories
   - Fill in your MongoDB URI, JWT secret, and Cloudinary credentials

4. Start the development server:
```bash
npm run dev
```

## 🔧 Environment Variables

### Backend (.env)
```
MONGODB_URI=mongodb://localhost:27017/edunexus
JWT_SECRET=your_jwt_secret_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
PORT=5000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

## 🎯 Demo Credentials

### Admin
- Email: admin@edunexus.com
- Password: admin123

### Instructor
- Email: instructor@edunexus.com
- Password: instructor123

### Student
- Email: student@edunexus.com
- Password: student123

## 🚀 Deployment

- **Frontend**: Vercel (Create React App)
- **Backend**: Render (Node/Express + Socket.io)
- **Database**: MongoDB Atlas

### Backend on Render
- Create Web Service → select this repo
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `MONGODB_URI=YOUR_ATLAS_CONNECTION_STRING`
  - `JWT_SECRET=GENERATE_A_SECURE_RANDOM_STRING`
  - `CLOUDINARY_CLOUD_NAME=...`
  - `CLOUDINARY_API_KEY=...`
  - `CLOUDINARY_API_SECRET=...`
  - `CLIENT_URL=https://<your-vercel-domain>.vercel.app`
  - `NODE_ENV=production`
- After deploy, copy the service URL (e.g. `https://<service>.onrender.com`).

### Frontend on Vercel
- Import Project → select this repo
- Root Directory: `frontend`
- Framework Preset: Create React App
- Build Command: `npm run build`
- Output Directory: `build`
- Environment Variables (Production):
  - `REACT_APP_API_URL=https://<your-render-service>.onrender.com/api`
  - `REACT_APP_SOCKET_URL=https://<your-render-service>.onrender.com`
- Deploy, then note your Vercel domain (e.g. `https://<app>.vercel.app`).

### Post-deploy
- Ensure Render `CLIENT_URL` matches your final Vercel domain (no trailing slash). Redeploy backend if changed.
- The frontend reads API base from `REACT_APP_API_URL` and Socket.io URL from `REACT_APP_SOCKET_URL`.
- Test: login/register, course lists, uploads (Cloudinary), and real-time chat (Socket.io).

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Courses
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create course (instructor)
- `PUT /api/courses/:id` - Update course (instructor)
- `DELETE /api/courses/:id` - Delete course (instructor)
- `POST /api/courses/:id/enroll` - Enroll in course (student)

### Lectures
- `POST /api/lectures` - Upload lecture video
- `GET /api/lectures/:courseId` - Get course lectures

### Assignments
- `POST /api/assignments` - Create assignment
- `GET /api/assignments/:courseId` - Get course assignments
- `POST /api/assignments/:id/submit` - Submit assignment

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **EduNexus Team** - *Initial work*

## 📱 Screenshots


