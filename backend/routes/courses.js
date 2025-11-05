const express = require('express');
const { body } = require('express-validator');
const Course = require('../models/Course');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/courses
// @desc    Get all courses
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { category, level, search, page = 1, limit = 10 } = req.query;
    const query = { isPublished: true };

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

    if (category) query.category = category;
    if (level) query.level = level;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await Course.find(query)
      .populate('instructor', 'name email avatar')
      .populate('lectures', 'title duration order')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await Course.countDocuments(query);

    res.json({
      courses: courses || [],
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ 
      message: 'Server error fetching courses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/courses/my-courses
// @desc    Get user's courses (enrolled or created)
// @access  Private
router.get('/my-courses', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('enrolledCourses')
      .populate('createdCourses');

    res.json({
      enrolledCourses: user.enrolledCourses,
      createdCourses: user.createdCourses
    });
  } catch (error) {
    console.error('Get my courses error:', error);
    res.status(500).json({ message: 'Server error fetching courses' });
  }
});

// @route   GET /api/courses/:id
// @desc    Get single course
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid course ID format' });
    }

    const course = await Course.findById(req.params.id)
      .populate('instructor', 'name email avatar')
      .populate('lectures', 'title duration order videoUrl isPreview')
      .populate('assignments', 'title dueDate maxMarks');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ 
      message: 'Server error fetching course',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/courses
// @desc    Create course
// @access  Private (Instructor)
router.post('/', auth, authorize('instructor'), [
  body('title').trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('category').notEmpty().withMessage('Category is required'),
  body('level').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid level')
], handleValidationErrors, async (req, res) => {
  try {

    const courseData = {
      ...req.body,
      instructor: req.user.id
    };

    const course = new Course(courseData);
    await course.save();

    // Add course to instructor's created courses
    await User.findByIdAndUpdate(req.user.id, {
      $push: { createdCourses: course._id }
    });

    res.status(201).json({
      message: 'Course created successfully',
      course
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ message: 'Server error creating course' });
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course
// @access  Private (Instructor - Owner)
router.put('/:id', auth, authorize('instructor'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this course' });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('instructor', 'name email avatar');

    res.json({
      message: 'Course updated successfully',
      course: updatedCourse
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ message: 'Server error updating course' });
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete course
// @access  Private (Instructor - Owner or Admin)
router.delete('/:id', auth, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (req.user.role !== 'admin' && course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this course' });
    }

    await Course.findByIdAndDelete(req.params.id);

    // Remove course from instructor's created courses
    await User.findByIdAndUpdate(course.instructor, {
      $pull: { createdCourses: course._id }
    });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error deleting course' });
  }
});

// @route   POST /api/courses/:id/enroll
// @desc    Enroll in course
// @access  Private (Student)
router.post('/:id/enroll', auth, authorize('student'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!course.isPublished) {
      return res.status(400).json({ message: 'Course is not published yet' });
    }

    // Check if already enrolled
    if (course.students.includes(req.user.id)) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    // Add student to course
    course.students.push(req.user.id);
    await course.save();

    // Add course to student's enrolled courses
    await User.findByIdAndUpdate(req.user.id, {
      $push: { enrolledCourses: course._id }
    });

    res.json({ message: 'Successfully enrolled in course' });
  } catch (error) {
    console.error('Enroll course error:', error);
    res.status(500).json({ message: 'Server error enrolling in course' });
  }
});

module.exports = router;
