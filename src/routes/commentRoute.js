const { Router } = require("express");
const { Comment, Blog, User } = require("../models");
const { isValidObjectId } = require("mongoose");

// blogRoute.js에서 설정한 엔드포인트 /:blogId의 값 불러올 수 있게 해주는 설정
const commentRouter = Router({ mergeParams: true });

// comment의 경로?
// - 위의 두 개와 달리 독립적으로 호출될 일 X, 하위 개념
// - 특정 블로그의 댓글 등을 불러오게 될 것

// 댓글 등록 API
commentRouter.post("/", async (req, res) => {
  try {
    const { blogId } = req.params;
    if (!isValidObjectId(blogId))
      return res.status(400).send({ err: "blog id is invalid." });

    const { content, userId } = req.body;
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "user id is invalid." });
    if (typeof content !== "string")
      return res.status(400).send({ err: "content is required." });

    // blog, user 호출을 동시에 하면 시간 줄일 수 있음
    const [blog, user] = await Promise.all([
      Blog.findById(blogId),
      User.findById(userId),
    ]);

    if (!blog || !user)
      return res.status(400).send({ err: "blog or user does not exist." });
    if (!blog.islive)
      return res.status(400).send({ err: "blog is not available." });

    const comment = new Comment({
      content,
      user,
      userFullName: `${user.name.first} ${user.name.last}`,
      blog,
    });

    // blog에 comment 내장하도록 스키마 구조 수정됨, 댓글 생성 시 blog도 바꿔줘야 함
    await Promise.all([
      comment.save(),
      Blog.updateOne({ _id: blogId }, { $push: { comments: comment } }),
    ]);

    res.send({ success: true, comment });
  } catch (err) {
    return res.status(500).send({ err: err.message });
  }
});

// 댓글 조회 API
commentRouter.get("/", async (req, res) => {
  try {
    const { blogId } = req.params;
    if (!isValidObjectId(blogId))
      return res.status(400).send({ err: "blog id is invalid." });

    // 블로그 id 존재 여부 필요하지 않은 이유, 해당하는 댓글 없으므로 어차피 빈 배열 리턴됨
    // 생성/수정이 아닌 경우에는 확인을 최소화하는 것이 좋음
    const comments = await Comment.find({ blog: blogId });
    res.send({ success: true, comments });
  } catch (err) {
    return res.status(500).send({ err: err.message });
  }
});

// 후기의 content만 수정하는 API
commentRouter.patch("/:commentId", async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  if (typeof content !== "string")
    return res.status(400).send({ err: "content is required." });

  // 디스트럭처링, 이 경우 Promise.all 배열의 첫 번째 요소만 변수 comment에 받아오게 됨
  const [comment] = await Promise.all([
    Comment.findOneAndUpdate({ _id: commentId }, { content }, { new: true }),
    // 블로그에 내장된 후기 수정
    Blog.updateOne(
      { "comments._id": commentId },
      { "comments.$.content": content }
    ),
  ]);

  return res.send({ success: true, comment });
});

// 삭제 API
commentRouter.delete("/:commentId", async (req, res) => {
  const { commentId } = req.params;

  const [comment] = await Promise.all([
    Comment.findOneAndDelete({ _id: commentId }),
    Blog.updateOne(
      { "comments._id": commentId },
      { $pull: { comments: { _id: commentId } } }
    ),
  ]);

  res.send({ success: true, comment });
});

module.exports = { commentRouter };
