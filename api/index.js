/**
 * dongzhongcen's Blog API Server
 * 
 * 环境变量:
 * - DATABASE_URL: Neon PostgreSQL 连接字符串
 * - PORT: 服务器端口 (默认 3001)
 * - CORS_ORIGIN: 允许的跨域来源
 */

const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// 数据库连接
const sql = neon(process.env.DATABASE_URL);

// 生成用户指纹 (简单的浏览器标识)
function getUserFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  return require('crypto').createHash('sha256').update(userAgent + ip).digest('hex').substring(0, 32);
}

// 生成会话ID
function getSessionId(req) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  const timestamp = Math.floor(Date.now() / 1000 / 60 / 30); // 30分钟一个会话
  return require('crypto').createHash('sha256').update(userAgent + ip + timestamp).digest('hex').substring(0, 32);
}

// ============================================
// API 路由
// ============================================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 文章统计 API
// ============================================

// 获取单篇文章统计
app.get('/api/posts/:postId/stats', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const fingerprint = getUserFingerprint(req);
    
    const result = await sql`
      SELECT 
        ps.post_id,
        ps.views,
        ps.likes,
        COUNT(DISTINCT c.id) as comment_count,
        EXISTS(
          SELECT 1 FROM user_likes 
          WHERE post_id = ${postId} AND user_fingerprint = ${fingerprint}
        ) as user_liked
      FROM post_stats ps
      LEFT JOIN comments c ON c.post_id = ps.post_id AND c.is_approved = true
      WHERE ps.post_id = ${postId}
      GROUP BY ps.post_id, ps.views, ps.likes
    `;
    
    if (result.length === 0) {
      // 返回默认值
      return res.json({
        post_id: postId,
        views: 0,
        likes: 0,
        comment_count: 0,
        user_liked: false
      });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching post stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取多篇文章统计
app.post('/api/posts/stats', async (req, res) => {
  try {
    const { postIds } = req.body;
    const fingerprint = getUserFingerprint(req);
    
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.json([]);
    }
    
    const result = await sql`
      SELECT 
        ps.post_id,
        ps.views,
        ps.likes,
        COUNT(DISTINCT c.id) as comment_count,
        EXISTS(
          SELECT 1 FROM user_likes 
          WHERE post_id = ps.post_id AND user_fingerprint = ${fingerprint}
        ) as user_liked
      FROM post_stats ps
      LEFT JOIN comments c ON c.post_id = ps.post_id AND c.is_approved = true
      WHERE ps.post_id IN ${sql(postIds)}
      GROUP BY ps.post_id, ps.views, ps.likes
    `;
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching posts stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 增加浏览量
app.post('/api/posts/:postId/view', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const sessionId = getSessionId(req);
    
    // 调用存储过程
    const result = await sql`SELECT increment_post_views(${postId}, ${sessionId}) as views`;
    
    res.json({ 
      post_id: postId, 
      views: result[0]?.views || 0 
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 点赞/取消点赞
app.post('/api/posts/:postId/like', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const fingerprint = getUserFingerprint(req);
    
    // 调用存储过程
    const result = await sql`SELECT toggle_post_like(${postId}, ${fingerprint}) as result`;
    
    res.json(result[0]?.result || { liked: false, likes: 0 });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 评论 API
// ============================================

// 获取文章评论
app.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // 获取评论
    const comments = await sql`
      SELECT 
        id,
        post_id,
        author_name,
        author_avatar,
        content,
        likes,
        parent_id,
        created_at
      FROM comments
      WHERE post_id = ${postId} AND is_approved = true AND parent_id IS NULL
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;
    
    // 获取总数
    const countResult = await sql`
      SELECT COUNT(*) as total 
      FROM comments 
      WHERE post_id = ${postId} AND is_approved = true
    `;
    
    res.json({
      comments,
      total: parseInt(countResult[0]?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加评论
app.post('/api/posts/:postId/comments', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const { author_name, content, avatar } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }
    
    if (content.length > 2000) {
      return res.status(400).json({ error: '评论内容过长，最多2000字符' });
    }
    
    // 调用存储过程
    const result = await sql`
      SELECT add_post_comment(${postId}, ${author_name}, ${content}, ${avatar || null}) as result
    `;
    
    // 获取新添加的评论
    const newComment = await sql`
      SELECT 
        id,
        post_id,
        author_name,
        author_avatar,
        content,
        likes,
        created_at
      FROM comments
      WHERE id = ${result[0]?.result?.id}
    `;
    
    res.json({
      success: true,
      comment: newComment[0],
      comment_count: result[0]?.result?.comment_count
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除评论
app.delete('/api/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    
    // 软删除 (将评论标记为未批准)
    await sql`
      UPDATE comments 
      SET is_approved = false 
      WHERE id = ${commentId}
    `;
    
    res.json({ success: true, message: '评论已删除' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 点赞评论
app.post('/api/comments/:commentId/like', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const fingerprint = getUserFingerprint(req);
    
    // 检查是否已经点赞
    const existing = await sql`
      SELECT 1 FROM comment_likes 
      WHERE comment_id = ${commentId} AND user_fingerprint = ${fingerprint}
    `;
    
    if (existing.length > 0) {
      // 取消点赞
      await sql`
        DELETE FROM comment_likes 
        WHERE comment_id = ${commentId} AND user_fingerprint = ${fingerprint}
      `;
      
      await sql`
        UPDATE comments 
        SET likes = GREATEST(0, likes - 1) 
        WHERE id = ${commentId}
      `;
      
      const result = await sql`SELECT likes FROM comments WHERE id = ${commentId}`;
      
      return res.json({ liked: false, likes: result[0]?.likes || 0 });
    }
    
    // 添加点赞
    await sql`
      INSERT INTO comment_likes (comment_id, user_fingerprint)
      VALUES (${commentId}, ${fingerprint})
    `;
    
    await sql`
      UPDATE comments 
      SET likes = likes + 1 
      WHERE id = ${commentId}
    `;
    
    const result = await sql`SELECT likes FROM comments WHERE id = ${commentId}`;
    
    res.json({ liked: true, likes: result[0]?.likes || 0 });
  } catch (error) {
    console.error('Error liking comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 贡献图 API
// ============================================

// 获取贡献图数据
app.get('/api/contributions', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const result = await sql`
      SELECT 
        stat_date as date,
        post_count + view_count + comment_count + like_count as count,
        CASE 
          WHEN post_count + view_count + comment_count + like_count = 0 THEN 0
          WHEN post_count + view_count + comment_count + like_count <= 50 THEN 1
          WHEN post_count + view_count + comment_count + like_count <= 150 THEN 2
          WHEN post_count + view_count + comment_count + like_count <= 300 THEN 3
          ELSE 4
        END as level
      FROM daily_stats
      WHERE EXTRACT(YEAR FROM stat_date) = ${parseInt(year)}
      ORDER BY stat_date
    `;
    
    // 计算统计信息
    const stats = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE post_count + view_count + comment_count + like_count > 0) as active_days,
        SUM(post_count + view_count + comment_count + like_count) as total,
        MAX(post_count + view_count + comment_count + like_count) as max_count
      FROM daily_stats
      WHERE EXTRACT(YEAR FROM stat_date) = ${parseInt(year)}
    `;
    
    res.json({
      year: parseInt(year),
      data: result,
      stats: {
        activeDays: parseInt(stats[0]?.active_days || 0),
        total: parseInt(stats[0]?.total || 0),
        max: parseInt(stats[0]?.max_count || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 博客统计 API
// ============================================

// 获取博客整体统计
app.get('/api/stats', async (req, res) => {
  try {
    const result = await sql`
      SELECT 
        (SELECT COUNT(*) FROM post_stats) as total_posts,
        (SELECT SUM(views) FROM post_stats) as total_views,
        (SELECT SUM(likes) FROM post_stats) as total_likes,
        (SELECT COUNT(*) FROM comments WHERE is_approved = true) as total_comments
    `;
    
    res.json(result[0] || {
      total_posts: 0,
      total_views: 0,
      total_likes: 0,
      total_comments: 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 错误处理
// ============================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Blog API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
