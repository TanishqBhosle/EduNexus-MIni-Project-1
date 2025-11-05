const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');
const Lecture = require('../models/Lecture');
const Course = require('../models/Course');
const { auth, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

// @route   POST /api/lectures
// @desc    Upload lecture video
// @access  Private (Instructor)
router.post('/', auth, authorize('instructor'), upload.single('video'), [
  body('title').trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('course').isMongoId().withMessage('Valid course ID is required')
], handleValidationErrors, async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ message: 'Video file is required' });
    }

    const { title, description, course, order, isPreview, notes } = req.body;

    // Verify course exists and user is the instructor
    const courseDoc = await Course.findById(course);
    if (!courseDoc) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (courseDoc.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to add lectures to this course' });
    }

    // Upload video to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'edunexus/lectures',
          public_id: `${course}_${Date.now()}`,
          chunk_size: 6000000, // 6MB chunks
          eager: [
            { width: 640, height: 360, crop: 'scale' },
            { width: 1280, height: 720, crop: 'scale' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    // Create lecture
    const lecture = new Lecture({
      title,
      description,
      course,
      videoUrl: result.secure_url,
      videoId: result.public_id,
      duration: result.duration,
      order: order || 0,
      isPreview: isPreview === 'true',
      notes
    });

    await lecture.save();

    // Add lecture to course
    courseDoc.lectures.push(lecture._id);
    await courseDoc.save();

    res.status(201).json({
      message: 'Lecture uploaded successfully',
      lecture
    });
  } catch (error) {
    console.error('Upload lecture error:', error);
    res.status(500).json({ message: 'Server error uploading lecture' });
  }
});

// @route   GET /api/lectures/:courseId
// @desc    Get course lectures
// @access  Private (Enrolled students or instructor)
router.get('/:courseId', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is enrolled or is the instructor
    const isEnrolled = course.students.includes(req.user.id);
    const isInstructor = course.instructor.toString() === req.user.id;

    if (!isEnrolled && !isInstructor) {
      return res.status(403).json({ message: 'Not authorized to view lectures' });
    }

    const lectures = await Lecture.find({ course: req.params.courseId })
      .sort({ order: 1 });

    res.json(lectures);
  } catch (error) {
    console.error('Get lectures error:', error);
    res.status(500).json({ message: 'Server error fetching lectures' });
  }
});

// @route   PUT /api/lectures/:id
// @desc    Update lecture
// @access  Private (Instructor - Owner)
router.put('/:id', auth, authorize('instructor'), [
  body('title').optional().trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lecture = await Lecture.findById(req.params.id).populate('course');
    
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    if (lecture.course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this lecture' });
    }

    const updatedLecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Lecture updated successfully',
      lecture: updatedLecture
    });
  } catch (error) {
    console.error('Update lecture error:', error);
    res.status(500).json({ message: 'Server error updating lecture' });
  }
});

// @route   DELETE /api/lectures/:id
// @desc    Delete lecture
// @access  Private (Instructor - Owner)
router.delete('/:id', auth, authorize('instructor'), async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id).populate('course');
    
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    if (lecture.course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this lecture' });
    }

    // Delete video from Cloudinary
    try {
      await cloudinary.uploader.destroy(lecture.videoId, { resource_type: 'video' });
    } catch (cloudinaryError) {
      console.error('Cloudinary deletion error:', cloudinaryError);
    }

    // Remove lecture from course
    await Course.findByIdAndUpdate(lecture.course._id, {
      $pull: { lectures: lecture._id }
    });

    await Lecture.findByIdAndDelete(req.params.id);

    res.json({ message: 'Lecture deleted successfully' });
  } catch (error) {
    console.error('Delete lecture error:', error);
    res.status(500).json({ message: 'Server error deleting lecture' });
  }
});

// @route   POST /api/lectures/:id/resources
// @desc    Add resource to lecture
// @access  Private (Instructor - Owner)
router.post('/:id/resources', auth, authorize('instructor'), [
  body('name').trim().notEmpty().withMessage('Resource name is required'),
  body('url').isURL().withMessage('Valid URL is required'),
  body('type').isIn(['pdf', 'doc', 'ppt', 'link', 'other']).withMessage('Invalid resource type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lecture = await Lecture.findById(req.params.id).populate('course');
    
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    if (lecture.course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to add resources to this lecture' });
    }

    const { name, url, type } = req.body;
    
    lecture.resources.push({ name, url, type });
    await lecture.save();

    res.json({
      message: 'Resource added successfully',
      lecture
    });
  } catch (error) {
    console.error('Add resource error:', error);
    res.status(500).json({ message: 'Server error adding resource' });
  }
});

module.exports = router;
