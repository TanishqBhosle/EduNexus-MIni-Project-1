const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');
const Assignment = require('../models/Assignment');
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
    fileSize: 10 * 1024 * 1024 // 10MB limit for assignments
  }
});

// @route   POST /api/assignments
// @desc    Create assignment
// @access  Private (Instructor)
router.post('/', auth, authorize('instructor'), [
  body('title').trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('course').isMongoId().withMessage('Valid course ID is required'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  body('maxMarks').optional().isNumeric().withMessage('Max marks must be a number')
], handleValidationErrors, async (req, res) => {
  try {

    const { title, description, course, dueDate, maxMarks = 100 } = req.body;

    // Verify course exists and user is the instructor
    const courseDoc = await Course.findById(course);
    if (!courseDoc) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (courseDoc.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to create assignments for this course' });
    }

    const assignment = new Assignment({
      title,
      description,
      course,
      instructor: req.user.id,
      dueDate,
      maxMarks
    });

    await assignment.save();

    // Add assignment to course
    courseDoc.assignments.push(assignment._id);
    await courseDoc.save();

    res.status(201).json({
      message: 'Assignment created successfully',
      assignment
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ message: 'Server error creating assignment' });
  }
});

// @route   GET /api/assignments/:courseId
// @desc    Get course assignments
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
      return res.status(403).json({ message: 'Not authorized to view assignments' });
    }

    const assignments = await Assignment.find({ course: req.params.courseId })
      .populate('instructor', 'name email')
      .sort({ createdAt: -1 });

    res.json(assignments);
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ message: 'Server error fetching assignments' });
  }
});

// @route   POST /api/assignments/:id/submit
// @desc    Submit assignment
// @access  Private (Student)
router.post('/:id/submit', auth, authorize('student'), upload.array('files', 5), [
  body('content').trim().notEmpty().withMessage('Submission content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const assignment = await Assignment.findById(req.params.id).populate('course');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if student is enrolled in the course
    if (!assignment.course.students.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    // Check if already submitted
    const existingSubmission = assignment.submissions.find(
      sub => sub.student.toString() === req.user.id
    );

    if (existingSubmission) {
      return res.status(400).json({ message: 'Assignment already submitted' });
    }

    // Check if due date has passed
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({ message: 'Assignment submission deadline has passed' });
    }

    const { content } = req.body;
    const attachments = [];

    // Upload files to Cloudinary if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                resource_type: 'auto',
                folder: 'edunexus/assignments',
                public_id: `${assignment._id}_${req.user.id}_${Date.now()}`
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(file.buffer);
          });

          attachments.push({
            name: file.originalname,
            url: result.secure_url,
            type: file.mimetype
          });
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
        }
      }
    }

    // Determine if submission is late
    const isLate = new Date() > new Date(assignment.dueDate);
    const status = isLate ? 'late' : 'submitted';

    // Add submission
    assignment.submissions.push({
      student: req.user.id,
      content,
      attachments,
      status
    });

    await assignment.save();

    res.json({
      message: 'Assignment submitted successfully',
      submission: assignment.submissions[assignment.submissions.length - 1]
    });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ message: 'Server error submitting assignment' });
  }
});

// @route   GET /api/assignments/:id/submissions
// @desc    Get assignment submissions
// @access  Private (Instructor - Owner)
router.get('/:id/submissions', auth, authorize('instructor'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('course');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view submissions' });
    }

    const submissions = await Assignment.findById(req.params.id)
      .populate('submissions.student', 'name email')
      .select('submissions');

    res.json(submissions.submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ message: 'Server error fetching submissions' });
  }
});

// @route   PUT /api/assignments/:id/grade
// @desc    Grade assignment submission
// @access  Private (Instructor - Owner)
router.put('/:id/grade', auth, authorize('instructor'), [
  body('studentId').isMongoId().withMessage('Valid student ID is required'),
  body('marks').isNumeric().withMessage('Marks must be a number'),
  body('feedback').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { studentId, marks, feedback = '' } = req.body;

    const assignment = await Assignment.findById(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to grade this assignment' });
    }

    const submission = assignment.submissions.find(
      sub => sub.student.toString() === studentId
    );

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    submission.marks = marks;
    submission.feedback = feedback;
    submission.status = 'graded';

    await assignment.save();

    res.json({
      message: 'Assignment graded successfully',
      submission
    });
  } catch (error) {
    console.error('Grade assignment error:', error);
    res.status(500).json({ message: 'Server error grading assignment' });
  }
});

// @route   PUT /api/assignments/:id
// @desc    Update assignment
// @access  Private (Instructor - Owner)
router.put('/:id', auth, authorize('instructor'), [
  body('title').optional().trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const assignment = await Assignment.findById(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this assignment' });
    }

    const updatedAssignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Assignment updated successfully',
      assignment: updatedAssignment
    });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ message: 'Server error updating assignment' });
  }
});

// @route   DELETE /api/assignments/:id
// @desc    Delete assignment
// @access  Private (Instructor - Owner)
router.delete('/:id', auth, authorize('instructor'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('course');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.instructor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this assignment' });
    }

    // Remove assignment from course
    await Course.findByIdAndUpdate(assignment.course._id, {
      $pull: { assignments: assignment._id }
    });

    await Assignment.findByIdAndDelete(req.params.id);

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ message: 'Server error deleting assignment' });
  }
});

module.exports = router;
