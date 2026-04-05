import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home    from './pages/Home';
import Media   from './pages/Media';
import Post    from './pages/Post';
import Profile from './pages/Profile';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Home />}    />
        <Route path="/media"   element={<Media />}   />
        <Route path="/post"    element={<Post />}    />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
